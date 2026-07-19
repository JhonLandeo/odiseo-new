import { Logger } from '@nestjs/common';
import { ConsumptionMetricsCron } from './consumption-metrics.cron';

/**
 * Wires a fake TenantService.runInSchema whose per-schema manager answers
 * each query the cron issues by matching a distinguishing substring, and a
 * fake default-connection EntityManager (`find` for active companies,
 * `query` for the public.consumption_metrics upserts).
 */
function createCron(
  options: {
    companies?: Array<{ id: string }>;
    failingTenants?: string[];
    schemaDelayMs?: number;
    onSchemaEnter?: (schema: string) => void;
    onSchemaExit?: (schema: string) => void;
    lockGrants?: boolean;
  } = {},
) {
  const {
    companies = [],
    failingTenants = [],
    schemaDelayMs = 0,
    onSchemaEnter,
    onSchemaExit,
    lockGrants = true,
  } = options;

  const upsertCalls: Array<{ sql: string; params: any[] }> = [];
  const entityManager = {
    find: jest.fn().mockResolvedValue(companies),
    query: jest.fn(async (sql: string, params: any[]) => {
      upsertCalls.push({ sql, params });
      return undefined;
    }),
  };

  const runInSchema = jest.fn(
    async (schema: string, op: (m: any) => Promise<any>) => {
      onSchemaEnter?.(schema);
      try {
        if (schemaDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, schemaDelayMs));
        }
        const tenantId = schema.replace('tenant_', '');
        if (failingTenants.includes(tenantId)) {
          throw new Error(`schema "${schema}" not available`);
        }
        const manager = {
          query: jest.fn(async (sql: string) => {
            if (sql.includes('.users')) return [{ count: '5' }];
            if (sql.includes('material_question_usage'))
              return [{ count: '11' }];
            if (sql.includes('pg_class')) return [{ bytes: '1048576' }]; // 1 MB DB
            if (sql.includes('SUM(page_count)')) return [{ total: '42' }];
            if (sql.includes('SUM(file_size_bytes)'))
              return [{ bytes: '2097152' }]; // 2 MB S3, all-time
            return [{}];
          }),
        };
        return op(manager);
      } finally {
        onSchemaExit?.(schema);
      }
    },
  );

  const tenantService = { runInSchema };
  const lock = {
    tryAcquire: jest.fn().mockResolvedValue(lockGrants),
    runExclusively: jest.fn((_key: string, _ttl: number, work: () => any) =>
      lockGrants ? work() : Promise.resolve(undefined),
    ),
  };

  const cron = new ConsumptionMetricsCron(
    tenantService as any,
    entityManager as any,
    lock as any,
  );

  return { cron, entityManager, tenantService, lock, runInSchema, upsertCalls };
}

describe('ConsumptionMetricsCron', () => {
  let warn: jest.SpyInstance;
  // Real "now" at test-run time, used instead of faking timers: faking Date
  // would also have to spare `setTimeout` for the concurrency test below,
  // which needs a REAL, ordering-sensitive delay to observe interleaving.
  const now = new Date();
  const currentBillingMonth = now.getUTCMonth() + 1;
  const currentBillingYear = now.getUTCFullYear();

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('guards the run behind a job-specific lock', async () => {
    const { cron, lock } = createCron();

    await cron.handleCron();

    expect(lock.runExclusively).toHaveBeenCalledWith(
      'cron:consumption-metrics:collect',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('uses a TTL shorter than the hourly schedule interval', async () => {
    const { cron, lock } = createCron();

    await cron.handleCron();

    const ttl = lock.runExclusively.mock.calls[0][1];
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThan(60 * 60 * 1000);
  });

  it('touches nothing when another replica already holds the lock', async () => {
    const { cron, entityManager } = createCron({ lockGrants: false });

    await expect(cron.handleCron()).resolves.toBeUndefined();

    expect(entityManager.find).not.toHaveBeenCalled();
  });

  it('upserts all 4 metric rows per active tenant for the current billing month/year', async () => {
    const { cron, upsertCalls } = createCron({
      companies: [{ id: 'c1' }],
    });

    await cron.handleCron();

    expect(upsertCalls).toHaveLength(4);
    const metricTypes = upsertCalls.map((c) => c.params[1]).sort();
    expect(metricTypes).toEqual(
      [
        'active_users',
        'pdf_pages_generated',
        'questions_used',
        'storage_mb',
      ].sort(),
    );
    for (const call of upsertCalls) {
      expect(call.sql).toMatch(/ON CONFLICT/i);
      expect(call.params[0]).toBe('c1');
      expect(call.params[3]).toBe(currentBillingMonth);
      expect(call.params[4]).toBe(currentBillingYear);
    }
  });

  it('computes values from the per-schema queries: active_users, questions_used, pdf_pages_generated, and combined DB+S3 storage_mb', async () => {
    const { cron, upsertCalls } = createCron({ companies: [{ id: 'c1' }] });

    await cron.handleCron();

    const byType = new Map(upsertCalls.map((c) => [c.params[1], c.params[2]]));
    expect(byType.get('active_users')).toBe(5);
    expect(byType.get('questions_used')).toBe(11);
    expect(byType.get('pdf_pages_generated')).toBe(42);
    // storage_mb = (1 MB DB + 2 MB S3) = 3 MB.
    expect(byType.get('storage_mb')).toBe(3);
  });

  // Regression: scoping this query by created_at (request-submission time)
  // instead of completed_at (generation-completion time) permanently drops a
  // course whose generation crosses a month boundary from every bucket.
  it('scopes the pdf_pages_generated query by completed_at, not created_at', async () => {
    const queriesRun: string[] = [];
    const { cron } = createCron({ companies: [{ id: 'c1' }] });
    const originalRunInSchema = (cron as any).tenantService.runInSchema;
    (cron as any).tenantService.runInSchema = async (
      schema: string,
      op: (m: any) => Promise<any>,
    ) =>
      originalRunInSchema(schema, async (manager: any) => {
        const originalQuery = manager.query;
        manager.query = async (sql: string, ...rest: any[]) => {
          queriesRun.push(sql);
          return originalQuery(sql, ...rest);
        };
        return op(manager);
      });

    await cron.handleCron();

    const pdfPagesQuery = queriesRun.find((sql) =>
      sql.includes('SUM(page_count)'),
    );
    expect(pdfPagesQuery).toBeDefined();
    expect(pdfPagesQuery).toMatch(/completed_at\s*>=/);
    expect(pdfPagesQuery).not.toMatch(/created_at/);
  });

  it('does not abort the run when one tenant fails, and still upserts the others', async () => {
    const { cron, upsertCalls } = createCron({
      companies: [{ id: 'c1' }, { id: 'c2' }],
      failingTenants: ['c1'],
    });

    await cron.handleCron();

    // Only c2's 4 metrics were upserted; c1 failed and was skipped.
    expect(upsertCalls).toHaveLength(4);
    expect(upsertCalls.every((c) => c.params[0] === 'c2')).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('tenant c1'));
  });

  it('bounds the number of tenant schemas processed concurrently', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const { cron } = createCron({
      companies: Array.from({ length: 12 }, (_, i) => ({ id: `c${i}` })),
      schemaDelayMs: 5,
      onSchemaEnter: () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
      },
      onSchemaExit: () => {
        inFlight--;
      },
    });

    await cron.handleCron();

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('does nothing when there are no active companies', async () => {
    const { cron, upsertCalls } = createCron({ companies: [] });

    await cron.handleCron();

    expect(upsertCalls).toHaveLength(0);
  });
});
