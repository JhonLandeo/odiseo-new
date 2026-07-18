import { OnboardingService } from './onboarding.service';

function createService() {
  const manager = { query: jest.fn() };
  const tenantService = {
    runInTenant: jest.fn((op: (m: any) => Promise<any>) => op(manager)),
  };
  const service = new OnboardingService(tenantService as any);
  return { service, manager };
}

/** Queries issued by getProgress, in order: dismissal row, then the EXISTS row. */
function mockProgressQueries(
  manager: any,
  dismissalRows: any[],
  flags: Record<string, boolean>,
) {
  manager.query
    .mockResolvedValueOnce(dismissalRows)
    .mockResolvedValueOnce([flags]);
}

const NO_STEPS = {
  create_cycle: false,
  create_pdf_template: false,
  setup_syllabus: false,
  generate_material: false,
};

describe('OnboardingService', () => {
  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────── C3 / C4 ────────────────────────
  describe('getProgress', () => {
    it('performs no writes (HTTP GET stays safe)', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [], NO_STEPS);

      await service.getProgress();

      const statements: string[] = manager.query.mock.calls.map(
        (call: any[]) => call[0],
      );
      // Word-bounded: `deleted_at IS NULL` is a legitimate read predicate.
      expect(
        statements.some((sql) => /\b(INSERT|UPDATE|DELETE)\b/i.test(sql)),
      ).toBe(false);
    });

    it('uses exactly two round-trips instead of six', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [], NO_STEPS);

      await service.getProgress();

      expect(manager.query).toHaveBeenCalledTimes(2);
    });

    it('collapses the four existence checks into one EXISTS query, preserving the soft-delete predicates', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [], NO_STEPS);

      await service.getProgress();

      const existsSql: string = manager.query.mock.calls[1][0];
      expect(existsSql).toContain(
        'EXISTS(SELECT 1 FROM cycles WHERE deleted_at IS NULL)',
      );
      expect(existsSql).toContain(
        'EXISTS(SELECT 1 FROM syllabus WHERE is_active = true)',
      );
      expect(existsSql).toContain('EXISTS(SELECT 1 FROM pdf_design_templates)');
      expect(existsSql).toContain('EXISTS(SELECT 1 FROM materials)');
    });

    it('derives completion from the real tables', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [{ is_dismissed: false }], {
        create_cycle: true,
        create_pdf_template: true,
        setup_syllabus: false,
        generate_material: false,
      });

      const result = await service.getProgress();

      expect(result.stepsCompleted).toEqual([
        'create_cycle',
        'create_pdf_template',
      ]);
      expect(result.progressPercentage).toBe(50);
      expect(result.availableSteps).toHaveLength(4);
      expect(result.availableSteps[2].completed).toBe(false);
    });

    it('treats a missing progress row as "not dismissed" without creating one', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [], NO_STEPS);

      const result = await service.getProgress();

      expect(result.isDismissed).toBe(false);
      expect(result.progressPercentage).toBe(0);
      expect(manager.query).toHaveBeenCalledTimes(2);
    });

    it('reports 100% when all four steps are satisfied', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [{ is_dismissed: true }], {
        create_cycle: true,
        create_pdf_template: true,
        setup_syllabus: true,
        generate_material: true,
      });

      const result = await service.getProgress();

      expect(result.progressPercentage).toBe(100);
      expect(result.isDismissed).toBe(true);
    });

    // C1 — the read side must pick the same row every time.
    it('reads the dismissal flag from a deterministically ordered row', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [{ is_dismissed: false }], NO_STEPS);

      await service.getProgress();

      const sql: string = manager.query.mock.calls[0][0];
      expect(sql).toMatch(/ORDER BY created_at ASC, id ASC/);
      expect(sql).toContain('LIMIT 1');
    });
  });

  // ─────────────────────────────── C1 / C2 ────────────────────────
  //
  // These assertions previously pinned the advisory-lock + CTE implementation.
  // Migration 0004 gives onboarding_progress a real singleton UNIQUE index, so
  // the same invariants are now asserted against the constraint-backed upsert:
  // exclusion is structural rather than cooperative, which is strictly
  // stronger — it holds against writers that never call this method.
  describe('dismissTour / resetTour', () => {
    it('relies on the database constraint, not a cooperative advisory lock', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const statements: string[] = manager.query.mock.calls.map(
        (call: any[]) => call[0],
      );
      expect(statements.some((sql) => /pg_advisory/i.test(sql))).toBe(false);
    });

    it('never issues an UPDATE without a WHERE clause', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const statements: string[] = manager.query.mock.calls.map(
        (call: any[]) => call[0],
      );
      // The only UPDATE is ON CONFLICT's, which by definition targets exactly
      // the single conflicting row — there is no unscoped `UPDATE ... SET`.
      const bareUpdate = statements.some((sql) =>
        /\bUPDATE\s+onboarding_progress\b/i.test(sql),
      );
      expect(bareUpdate).toBe(false);
      expect(manager.query.mock.calls[0][0]).toMatch(
        /ON CONFLICT \(singleton\) DO UPDATE/i,
      );
    });

    it('updates or inserts in a single statement (no read-then-write race)', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.resetTour();

      // One statement total: no lock round-trip, no COUNT, no SELECT-then-write.
      expect(manager.query).toHaveBeenCalledTimes(1);
      const upsertSql: string = manager.query.mock.calls[0][0];
      expect(upsertSql).toContain('INSERT INTO onboarding_progress');
      expect(upsertSql).toMatch(/ON CONFLICT \(singleton\) DO UPDATE/i);
    });

    it('conflict-targets the singleton column so at most one row can exist', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const upsertSql: string = manager.query.mock.calls[0][0];
      expect(upsertSql).toMatch(
        /INSERT INTO onboarding_progress \(singleton,/i,
      );
      expect(upsertSql).toContain('VALUES (true, $1)');
      // steps_completed was dropped in migration 0004 — it must not reappear.
      expect(upsertSql).not.toContain('steps_completed');
    });

    it('passes the dismissal flag through and reports success', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      expect(await service.dismissTour()).toEqual({ success: true });
      expect(manager.query.mock.calls[0][1]).toEqual([true]);

      jest.clearAllMocks();
      manager.query.mockResolvedValue([]);

      expect(await service.resetTour()).toEqual({ success: true });
      expect(manager.query.mock.calls[0][1]).toEqual([false]);
    });
  });
});
