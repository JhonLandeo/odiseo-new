import { Logger } from '@nestjs/common';
import { MaterialsCron } from './materials.cron';

/**
 * Scope: the cross-replica exclusion added around this @Cron. The generation
 * walk itself is covered by generate-material.use-case.spec.ts.
 */
function createCron(lockGrants: boolean) {
  const entityManager = { find: jest.fn().mockResolvedValue([]) };
  const lock = {
    tryAcquire: jest.fn().mockResolvedValue(lockGrants),
    runExclusively: jest.fn((_key, _ttl, work: () => Promise<any>) =>
      lockGrants ? work() : Promise.resolve(undefined),
    ),
  };
  const materialsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const materialGeneratedListener = {
    markWeekGenerated: jest.fn().mockResolvedValue(true),
  };

  const cron = new MaterialsCron(
    {} as any,
    {} as any,
    {} as any,
    entityManager as any,
    lock as any,
    materialsQueue as any,
    materialGeneratedListener as any,
  );

  return { cron, entityManager, lock, materialsQueue, materialGeneratedListener };
}

/**
 * Scope: the reconciliation sweep (`handleReconciliationSweepCron`), which
 * closes the crash-window gap between a use-case's tx commit and its
 * post-commit emit/queue.add. `tenantService` here is a hand-rolled fake
 * (not `{} as any`) because the sweep methods call `runInSchema` directly to
 * run raw SQL against a schema, and `cls.runWith` to reuse
 * MaterialGeneratedListener.markWeekGenerated (which itself calls
 * `runInTenant`, reading the schema back off CLS).
 */
function createReconciliationCron(options?: {
  staleSyllabusWeeks?: any[];
  staleMaterialCourses?: any[];
  cycleMaterialTemplate?: { name: string } | null;
  companies?: any[];
}) {
  const companies = options?.companies ?? [
    { id: 'tenant-1', commercialName: 'Colegio Uno', logoUrl: null },
  ];
  const staleSyllabusWeeks = options?.staleSyllabusWeeks ?? [];
  const staleMaterialCourses = options?.staleMaterialCourses ?? [];
  const cycleMaterialTemplate =
    options?.cycleMaterialTemplate === undefined
      ? { name: 'Balotario Semanal' }
      : options.cycleMaterialTemplate;

  const entityManager = { find: jest.fn().mockResolvedValue(companies) };
  const lock = {
    tryAcquire: jest.fn().mockResolvedValue(true),
    runExclusively: jest.fn((_key, _ttl, work: () => Promise<any>) => work()),
  };
  const materialsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const materialGeneratedListener = {
    markWeekGenerated: jest.fn().mockResolvedValue(true),
  };

  const managerStub = {
    query: jest.fn((sql: string) => {
      if (sql.includes('FROM syllabus_distribution')) {
        return Promise.resolve(staleSyllabusWeeks);
      }
      if (sql.includes('FROM material_request_courses')) {
        return Promise.resolve(staleMaterialCourses);
      }
      return Promise.resolve([]);
    }),
    findOne: jest.fn().mockResolvedValue(cycleMaterialTemplate),
  };

  const tenantService = {
    runInSchema: jest.fn((_schema: string, work: (manager: any) => any) =>
      work(managerStub),
    ),
    runInTenant: jest.fn((work: (manager: any) => any) => work(managerStub)),
  };
  const cls = {
    runWith: jest.fn((_ctx: any, work: () => any) => work()),
  };

  const cron = new MaterialsCron(
    {} as any,
    tenantService as any,
    cls as any,
    entityManager as any,
    lock as any,
    materialsQueue as any,
    materialGeneratedListener as any,
  );

  return {
    cron,
    entityManager,
    lock,
    materialsQueue,
    materialGeneratedListener,
    tenantService,
    managerStub,
  };
}

describe('MaterialsCron', () => {
  it('guards the run behind a job-specific lock', async () => {
    const { cron, lock } = createCron(true);

    await cron.handleCron();

    expect(lock.runExclusively).toHaveBeenCalledWith(
      'cron:materials:auto-generate',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('uses a TTL that expires well within the daily interval', async () => {
    const { cron, lock } = createCron(true);

    await cron.handleCron();

    const ttl = lock.runExclusively.mock.calls[0][1];
    expect(ttl).toBeGreaterThan(0);
    // A replica that dies mid-run must not block tomorrow's tick.
    expect(ttl).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('proceeds to enumerate tenants when it wins the lock', async () => {
    const { cron, entityManager } = createCron(true);

    await cron.handleCron();

    expect(entityManager.find).toHaveBeenCalledTimes(1);
  });

  it('touches nothing when another replica already holds the lock', async () => {
    const { cron, entityManager } = createCron(false);

    // Without this, N replicas each read "no material yet" — the existence
    // check has no unique constraint behind it — and each enqueues a duplicate
    // generation job.
    await expect(cron.handleCron()).resolves.toBeUndefined();

    expect(entityManager.find).not.toHaveBeenCalled();
  });
});

/**
 * Scope: the reconciliation sweep that closes the crash-window gap between a
 * use-case's tx commit and its post-commit emit/queue.add. Instance 1
 * (syllabus) and instance 2 (materials) are covered separately, plus the
 * shared per-tenant error-isolation and no-log-noise behaviors.
 */
describe('MaterialsCron reconciliation sweep', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('recovers a stuck syllabus distribution week via MaterialGeneratedListener.markWeekGenerated', async () => {
    const staleSyllabusWeeks = [
      { cycleId: 'cycle-1', courseId: 'course-1', weekNumber: 3 },
    ];
    const { cron, materialGeneratedListener } = createReconciliationCron({
      staleSyllabusWeeks,
    });

    await cron.handleReconciliationSweepCron();

    expect(materialGeneratedListener.markWeekGenerated).toHaveBeenCalledWith(
      staleSyllabusWeeks[0],
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'recovered 1 stuck syllabus distribution week(s)',
      ),
    );
  });

  it('does not count a syllabus week as recovered when markWeekGenerated finds nothing to update', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const staleSyllabusWeeks = [
      { cycleId: 'cycle-1', courseId: 'course-1', weekNumber: 3 },
    ];
    const { cron, materialGeneratedListener } = createReconciliationCron({
      staleSyllabusWeeks,
    });
    materialGeneratedListener.markWeekGenerated.mockResolvedValue(false);

    await cron.handleReconciliationSweepCron();

    // Not counted as recovered -- the row will keep matching the query on
    // every future tick, so this must be surfaced, not silently "succeeded".
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('recovered'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no matching syllabus distribution'),
    );
    warnSpy.mockRestore();
  });

  it('redispatches a stuck material request course with the batch generate-pdf job shape', async () => {
    const staleMaterialCourses = [
      {
        courseRequestId: 'course-req-1',
        courseId: 'course-1',
        materialRequestId: 'req-1',
        cycleId: 'cycle-1',
        weekNumber: 3,
        designTemplateId: null,
        requiresReview: false,
        profileId: 'profile-1',
        materialType: 'BALOTARIO',
      },
    ];
    const { cron, materialsQueue } = createReconciliationCron({
      staleMaterialCourses,
    });

    await cron.handleReconciliationSweepCron();

    expect(materialsQueue.add).toHaveBeenCalledWith(
      'generate-pdf',
      expect.objectContaining({
        material_request_id: 'req-1',
        tenant_id: 'tenant-1',
        cycle_id: 'cycle-1',
        week_number: 3,
        template_name: 'Balotario Semanal',
        material_type: 'BALOTARIO',
        distributions: [
          expect.objectContaining({
            course_id: 'course-1',
            course_request_id: 'course-req-1',
          }),
        ],
      }),
      expect.anything(),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('redispatched 1 stuck material course(s)'),
    );
  });

  it('does nothing and logs nothing when no rows are stuck', async () => {
    const { cron, materialsQueue, materialGeneratedListener } =
      createReconciliationCron();

    await cron.handleReconciliationSweepCron();

    expect(materialGeneratedListener.markWeekGenerated).not.toHaveBeenCalled();
    expect(materialsQueue.add).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('guards the sweep behind its own lock, distinct from the daily generation lock', async () => {
    const { cron, lock } = createReconciliationCron();

    await cron.handleReconciliationSweepCron();

    expect(lock.runExclusively).toHaveBeenCalledWith(
      'cron:materials:reconciliation-sweep',
      expect.any(Number),
      expect.any(Function),
    );
    const ttl = lock.runExclusively.mock.calls[0][1];
    // Well under the 15-minute tick, so a replica that dies mid-sweep cannot
    // block the next tick from acquiring the lock.
    expect(ttl).toBeLessThan(15 * 60 * 1000);
  });

  it('does nothing when a replica already holds the reconciliation lock', async () => {
    const { cron, entityManager, lock } = createReconciliationCron();
    lock.runExclusively.mockImplementation(() => Promise.resolve(undefined));

    await expect(cron.handleReconciliationSweepCron()).resolves.toBeUndefined();

    expect(entityManager.find).not.toHaveBeenCalled();
  });

  it('binds the 5-minute staleness floor and a row cap into both queries', async () => {
    const { cron, managerStub } = createReconciliationCron();

    await cron.handleReconciliationSweepCron();

    const calls = managerStub.query.mock.calls as any[][];
    const syllabusCall = calls.find((call) =>
      call[0].includes('FROM syllabus_distribution'),
    );
    const materialCall = calls.find((call) =>
      call[0].includes('FROM material_request_courses'),
    );

    expect(syllabusCall?.[0]).toContain('LIMIT $2');
    expect(syllabusCall?.[1]).toEqual([5, 200]);
    expect(materialCall?.[0]).toContain('LIMIT $3');
    expect(materialCall?.[1]).toEqual(['PROCESSING', 5, 200]);
  });

  // Genuinely proving the WHERE clause's age comparison excludes a young row
  // needs a live Postgres — this raw SQL is exercised by a stub that returns
  // canned fixtures regardless of SQL content, same limitation every other
  // raw-SQL query in this codebase has at the unit-test layer (no e2e/
  // integration harness runs these against a real schema). What IS provable
  // here: the exact SQL text contains the age-comparison shape against the
  // SAME bound parameter asserted above, so a future edit that silently drops
  // the WHERE clause (but leaves the harmless-looking bound parameter in
  // place) still fails this test.
  it('shapes the WHERE clause as an age comparison against the bound threshold, not just an equality/presence check', async () => {
    const { cron, managerStub } = createReconciliationCron();

    await cron.handleReconciliationSweepCron();

    const calls = managerStub.query.mock.calls as any[][];
    const syllabusSql = calls.find((call) =>
      call[0].includes('FROM syllabus_distribution'),
    )?.[0];
    const materialSql = calls.find((call) =>
      call[0].includes('FROM material_request_courses'),
    )?.[0];

    expect(syllabusSql).toMatch(/completed_at\s*<\s*now\(\)\s*-\s*\(\$1/);
    expect(materialSql).toMatch(/updated_at\s*<\s*now\(\)\s*-\s*\(\$2/);
  });

  it('bumps MaterialRequest.updated_at after a successful redispatch, so a still-running (not crashed) request is not redispatched again on the very next tick', async () => {
    const staleMaterialCourses = [
      {
        courseRequestId: 'course-req-1',
        courseId: 'course-1',
        materialRequestId: 'req-1',
        cycleId: 'cycle-1',
        weekNumber: 3,
        designTemplateId: null,
        requiresReview: false,
        profileId: 'profile-1',
        materialType: 'BALOTARIO',
      },
    ];
    const { cron, managerStub } = createReconciliationCron({
      staleMaterialCourses,
    });

    await cron.handleReconciliationSweepCron();

    const bumpCall = (managerStub.query.mock.calls as any[][]).find((call) =>
      call[0].includes('UPDATE material_requests SET updated_at'),
    );
    expect(bumpCall).toBeDefined();
    expect(bumpCall?.[1]).toEqual(['req-1']);
  });

  it("does not let one tenant's failure block sweeping other tenants", async () => {
    const companies = [
      { id: 'tenant-fail', commercialName: 'Fail Co', logoUrl: null },
      { id: 'tenant-ok', commercialName: 'Ok Co', logoUrl: null },
    ];
    const staleSyllabusWeeks = [
      { cycleId: 'cycle-1', courseId: 'course-1', weekNumber: 1 },
    ];
    const { cron, tenantService, materialGeneratedListener } =
      createReconciliationCron({ companies, staleSyllabusWeeks });

    const workingImplementation = tenantService.runInSchema.getMockImplementation()!;
    tenantService.runInSchema.mockImplementation(
      (schema: string, work: (manager: any) => any) => {
        if (schema === 'tenant_tenant-fail') {
          return Promise.reject(new Error('boom'));
        }
        return workingImplementation(schema, work);
      },
    );

    await expect(cron.handleReconciliationSweepCron()).resolves.toBeUndefined();

    // tenant-ok was still swept despite tenant-fail's queries throwing.
    expect(materialGeneratedListener.markWeekGenerated).toHaveBeenCalledWith(
      staleSyllabusWeeks[0],
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'recovered 1 stuck syllabus distribution week(s) for tenant tenant-ok',
      ),
    );
  });
});
