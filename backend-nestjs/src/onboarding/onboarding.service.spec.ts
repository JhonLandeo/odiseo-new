import { OnboardingService, OnboardingStep } from './onboarding.service';

/** Canonical step order the service maps and reports in. */
const ORDERED_STEPS: OnboardingStep[] = [
  'create_cycle',
  'create_pdf_template',
  'setup_syllabus',
  'generate_material',
];

const USER_ID = '11111111-1111-1111-1111-111111111111';
const OTHER_USER_ID = '22222222-2222-2222-2222-222222222222';

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

      await service.getProgress(USER_ID);

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

      await service.getProgress(USER_ID);

      expect(manager.query).toHaveBeenCalledTimes(2);
    });

    it('collapses the four existence checks into one EXISTS query, preserving the soft-delete predicates', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [], NO_STEPS);

      await service.getProgress(USER_ID);

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

      const result = await service.getProgress(USER_ID);

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

      const result = await service.getProgress(USER_ID);

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

      const result = await service.getProgress(USER_ID);

      expect(result.progressPercentage).toBe(100);
      expect(result.isDismissed).toBe(true);
    });

    // Behavioural table over EXISTS combinations: percentage, stepsCompleted
    // ordering, and per-step booleans must all follow from the mocked rows.
    // Catches a real regression in the derivation math that string-matching
    // the SQL cannot see.
    const flagsFor = (completed: OnboardingStep[]): Record<string, boolean> => ({
      create_cycle: completed.includes('create_cycle'),
      create_pdf_template: completed.includes('create_pdf_template'),
      setup_syllabus: completed.includes('setup_syllabus'),
      generate_material: completed.includes('generate_material'),
    });

    it.each<[string, OnboardingStep[], number]>([
      ['0/4 — none', [], 0],
      ['1/4 — last only', ['generate_material'], 25],
      ['2/4 — first two', ['create_cycle', 'create_pdf_template'], 50],
      [
        '3/4 — skipping the second',
        ['create_cycle', 'setup_syllabus', 'generate_material'],
        75,
      ],
      [
        '4/4 — all',
        [
          'create_cycle',
          'create_pdf_template',
          'setup_syllabus',
          'generate_material',
        ],
        100,
      ],
    ])(
      'derives %s into the right percentage, steps, and per-step booleans',
      async (_label, completed, expectedPct) => {
        const { service, manager } = createService();
        mockProgressQueries(manager, [], flagsFor(completed));

        const result = await service.getProgress(USER_ID);

        // Percentage.
        expect(result.progressPercentage).toBe(expectedPct);
        // stepsCompleted preserves the canonical step order, not the input order.
        expect(result.stepsCompleted).toEqual(
          ORDERED_STEPS.filter((id) => completed.includes(id)),
        );
        // Per-step booleans line up with the same set, in canonical order.
        expect(result.availableSteps.map((s) => s.id)).toEqual(ORDERED_STEPS);
        expect(result.availableSteps.map((s) => s.completed)).toEqual(
          ORDERED_STEPS.map((id) => completed.includes(id)),
        );
      },
    );

    // Dismissal is per-user (migration 0007): the read is scoped to the caller.
    it('reads the dismissal flag scoped to the calling user', async () => {
      const { service, manager } = createService();
      mockProgressQueries(manager, [{ is_dismissed: false }], NO_STEPS);

      await service.getProgress(USER_ID);

      const sql: string = manager.query.mock.calls[0][0];
      expect(sql).toMatch(/WHERE user_id = \$1/i);
      expect(manager.query.mock.calls[0][1]).toEqual([USER_ID]);
      // The old per-tenant singleton read (ORDER BY ... LIMIT 1) is gone.
      expect(sql).not.toMatch(/LIMIT 1/i);
    });

    // The derived steps are tenant-level, but dismissal is per-user: two users
    // of the same tenant resolve independent dismissal state from the same
    // schema. The DB is what keys the row by user_id; here we prove the service
    // simply surfaces whatever that per-user read returns.
    it('resolves dismissal independently for two different users', async () => {
      const dismissedUser = createService();
      mockProgressQueries(dismissedUser.manager, [{ is_dismissed: true }], NO_STEPS);
      const dismissedResult = await dismissedUser.service.getProgress(USER_ID);

      const freshUser = createService();
      // No row for this user → tour still visible.
      mockProgressQueries(freshUser.manager, [], NO_STEPS);
      const freshResult = await freshUser.service.getProgress(OTHER_USER_ID);

      expect(dismissedResult.isDismissed).toBe(true);
      expect(freshResult.isDismissed).toBe(false);
      expect(dismissedUser.manager.query.mock.calls[0][1]).toEqual([USER_ID]);
      expect(freshUser.manager.query.mock.calls[0][1]).toEqual([OTHER_USER_ID]);
    });
  });

  // ─────────────────────────────── C1 / C2 ────────────────────────
  //
  // These assertions previously pinned the advisory-lock + CTE implementation,
  // then the per-tenant singleton. Migration 0007 keys the row on user_id with
  // a UNIQUE index, so the same invariants are asserted against the per-user
  // constraint-backed upsert: exclusion is structural (per user), which is
  // strictly stronger than a cooperative lock.
  describe('dismissTour / resetTour', () => {
    it('relies on the database constraint, not a cooperative advisory lock', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour(USER_ID);

      const statements: string[] = manager.query.mock.calls.map(
        (call: any[]) => call[0],
      );
      expect(statements.some((sql) => /pg_advisory/i.test(sql))).toBe(false);
    });

    it('never issues an UPDATE without a WHERE clause', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour(USER_ID);

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
        /ON CONFLICT \(user_id\) DO UPDATE/i,
      );
    });

    it('updates or inserts in a single statement (no read-then-write race)', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.resetTour(USER_ID);

      // One statement total: no lock round-trip, no COUNT, no SELECT-then-write.
      expect(manager.query).toHaveBeenCalledTimes(1);
      const upsertSql: string = manager.query.mock.calls[0][0];
      expect(upsertSql).toContain('INSERT INTO onboarding_progress');
      expect(upsertSql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/i);
    });

    it('conflict-targets user_id so at most one row can exist per user', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      await service.dismissTour(USER_ID);

      const upsertSql: string = manager.query.mock.calls[0][0];
      expect(upsertSql).toMatch(
        /INSERT INTO onboarding_progress \(user_id,/i,
      );
      expect(upsertSql).toContain('VALUES ($1, $2)');
      // The per-tenant singleton column was dropped in migration 0007.
      expect(upsertSql).not.toContain('singleton');
      // steps_completed was dropped in migration 0004 — it must not reappear.
      expect(upsertSql).not.toContain('steps_completed');
    });

    it('passes the calling user id and dismissal flag through and reports success', async () => {
      const { service, manager } = createService();
      manager.query.mockResolvedValue([]);

      expect(await service.dismissTour(USER_ID)).toEqual({ success: true });
      expect(manager.query.mock.calls[0][1]).toEqual([USER_ID, true]);

      jest.clearAllMocks();
      manager.query.mockResolvedValue([]);

      expect(await service.resetTour(USER_ID)).toEqual({ success: true });
      expect(manager.query.mock.calls[0][1]).toEqual([USER_ID, false]);
    });

    // Regression: a still-valid JWT for a since-deleted user (JwtAuthGuard
    // deliberately doesn't re-check account existence) used to surface the
    // FK violation as a raw 500 instead of a benign no-op.
    it('treats a foreign-key violation (deleted user, stale token) as a no-op, not an error', async () => {
      const { service, manager } = createService();
      manager.query.mockRejectedValue({ code: '23503' });

      await expect(service.dismissTour(USER_ID)).resolves.toEqual({
        success: true,
      });
      await expect(service.resetTour(USER_ID)).resolves.toEqual({
        success: true,
      });
    });

    it('still propagates a DB error that is not a foreign-key violation', async () => {
      const { service, manager } = createService();
      manager.query.mockRejectedValue({ code: '08006' });

      await expect(service.dismissTour(USER_ID)).rejects.toEqual({
        code: '08006',
      });
    });
  });
});
