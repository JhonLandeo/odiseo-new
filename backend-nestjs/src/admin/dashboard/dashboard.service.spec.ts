import { BadRequestException, Logger } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

function createService(options: {
  companyIds?: string[];
  failingSchemas?: string[];
  usersPerSchema?: number;
  questionsPerSchema?: number;
  schemaDelayMs?: number;
  onSchemaEnter?: (schema: string) => void;
  onSchemaExit?: (schema: string) => void;
}) {
  const {
    companyIds = [],
    failingSchemas = [],
    usersPerSchema = 3,
    questionsPerSchema = 5,
    schemaDelayMs = 0,
    onSchemaEnter,
    onSchemaExit,
  } = options;

  const publicQuery = jest
    .fn()
    .mockResolvedValue(companyIds.map((id) => ({ id })));
  const metricRepository = { manager: { query: publicQuery } };

  const schemaQueries: Array<{ schema: string; sql: string; params?: any[] }> =
    [];
  const runInSchema = jest.fn(
    async (schema: string, op: (m: any) => Promise<any>) => {
      onSchemaEnter?.(schema);
      try {
        if (schemaDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, schemaDelayMs));
        }
        if (failingSchemas.includes(schema)) {
          throw new Error(`schema "${schema}" does not exist`);
        }
        const manager = {
          query: jest.fn(async (sql: string, params?: any[]) => {
            schemaQueries.push({ schema, sql, params });
            if (sql.includes('material_question_usage')) {
              return [{ count: String(questionsPerSchema) }];
            }
            return [{ count: String(usersPerSchema) }];
          }),
        };
        return await op(manager);
      } finally {
        onSchemaExit?.(schema);
      }
    },
  );

  const service = new DashboardService(
    metricRepository as any,
    { runInSchema } as any,
  );
  return { service, publicQuery, runInSchema, schemaQueries };
}

describe('DashboardService.getMetrics', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    warn.mockRestore();
    jest.clearAllMocks();
  });

  it('rejects when tenant_id is missing', async () => {
    const { service } = createService({});
    await expect(service.getMetrics('')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('derives active_users and questions_used from real per-schema queries', async () => {
    const { service, schemaQueries } = createService({
      companyIds: ['c1'],
      usersPerSchema: 7,
      questionsPerSchema: 11,
    });

    const metrics = await service.getMetrics('c1');

    expect(metrics.active_users).toBe(7);
    expect(metrics.questions_used).toBe(11);
    expect(schemaQueries.some((q) => q.sql.includes('"tenant_c1".users'))).toBe(
      true,
    );
    expect(
      schemaQueries.some((q) =>
        q.sql.includes('"tenant_c1".material_question_usage'),
      ),
    ).toBe(true);
  });

  it('keeps the not-yet-derivable billing metrics at 0', async () => {
    const { service } = createService({ companyIds: ['c1'] });

    const metrics = await service.getMetrics('c1');

    expect(metrics.storage_mb).toBe(0);
    expect(metrics.pdf_pages_generated).toBe(0);
  });

  it('filters questions_used by the requested date range', async () => {
    const { service, schemaQueries } = createService({ companyIds: ['c1'] });

    await service.getMetrics('c1', '2026-01-01', '2026-01-31');

    const usage = schemaQueries.find((q) =>
      q.sql.includes('material_question_usage'),
    );
    expect(usage?.sql).toMatch(/used_at >= \$1/);
    expect(usage?.sql).toMatch(/used_at < \$2/);
    expect(usage?.params).toEqual([
      new Date('2026-01-01'),
      new Date('2026-02-01'),
    ]);
  });

  // end_date parses to midnight, so `used_at <= end` silently excluded every
  // row of the final day. The range must cover the WHOLE last day via an
  // exclusive bound of end_date + 1 day.
  it('includes the entire final day of the range', async () => {
    const { service, schemaQueries } = createService({ companyIds: ['c1'] });

    await service.getMetrics('c1', '2026-01-31', '2026-01-31');

    const usage = schemaQueries.find((q) =>
      q.sql.includes('material_question_usage'),
    );
    expect(usage?.sql).not.toMatch(/used_at <= /);
    expect(usage?.params).toEqual([
      new Date('2026-01-31'),
      new Date('2026-02-01'),
    ]);
  });

  it('rejects an unparseable date instead of silently returning unfiltered totals', async () => {
    const { service } = createService({ companyIds: ['c1'] });

    await expect(service.getMetrics('c1', 'not-a-date')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('surfaces a single tenant failure as an error, not a fake zero', async () => {
    const { service } = createService({
      companyIds: ['c1'],
      failingSchemas: ['tenant_c1'],
    });

    await expect(service.getMetrics('c1')).rejects.toThrow(/does not exist/);
  });

  describe("aggregate ('all') fan-out", () => {
    it('sums every tenant and skips a failing one with a warning', async () => {
      const { service } = createService({
        companyIds: ['c1', 'c2', 'c3'],
        failingSchemas: ['tenant_c2'],
        usersPerSchema: 3,
        questionsPerSchema: 5,
      });

      const metrics = await service.getMetrics('all');

      expect(metrics.active_users).toBe(6);
      expect(metrics.questions_used).toBe(10);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('tenant_c2 not available'),
      );
    });

    it('bounds the number of schemas queried concurrently', async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const { service } = createService({
        companyIds: Array.from({ length: 12 }, (_, i) => `c${i}`),
        schemaDelayMs: 5,
        onSchemaEnter: () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
        },
        onSchemaExit: () => {
          inFlight--;
        },
      });

      await service.getMetrics('all');

      expect(maxInFlight).toBeLessThanOrEqual(4);
      expect(maxInFlight).toBeGreaterThan(1);
    });
  });
});
