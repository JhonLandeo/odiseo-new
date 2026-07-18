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
  describe('dismissTour / resetTour', () => {
    it('takes a tenant-scoped advisory lock before the get-or-create', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const lockSql: string = manager.query.mock.calls[0][0];
      expect(lockSql).toContain('pg_advisory_xact_lock');
      expect(lockSql).toContain('current_schema()');
    });

    it('never issues an UPDATE without a WHERE clause', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const upsertSql: string = manager.query.mock.calls[1][0];
      expect(upsertSql).toMatch(/UPDATE onboarding_progress p[\s\S]*WHERE p\.id = e\.id/);
    });

    it('updates or inserts in a single statement (no COUNT-then-write race)', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.resetTour();

      // 1 advisory lock + 1 upsert. No separate COUNT round-trip.
      expect(manager.query).toHaveBeenCalledTimes(2);
      const upsertSql: string = manager.query.mock.calls[1][0];
      expect(upsertSql).toContain('INSERT INTO onboarding_progress');
      expect(upsertSql).toContain('WHERE NOT EXISTS (SELECT 1 FROM updated)');
    });

    it('scopes the insert-or-update to a single row selected deterministically', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour();

      const upsertSql: string = manager.query.mock.calls[1][0];
      expect(upsertSql).toMatch(/ORDER BY created_at ASC, id ASC[\s\S]*LIMIT 1/);
    });

    it('passes the dismissal flag through and reports success', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      expect(await service.dismissTour()).toEqual({ success: true });
      expect(manager.query.mock.calls[1][1]).toEqual([true]);

      jest.clearAllMocks();
      manager.query.mockResolvedValue([]);

      expect(await service.resetTour()).toEqual({ success: true });
      expect(manager.query.mock.calls[1][1]).toEqual([false]);
    });
  });
});
