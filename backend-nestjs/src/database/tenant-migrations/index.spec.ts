import { TENANT_MIGRATIONS } from './index';

// 0008 backfills the FK-side btree indexes the hot joins were missing. The
// list is append-only, so the migration must land last and stay idempotent
// like every other entry.
describe('tenant migration 0008 — FK join indexes', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find((m) => m.id === '0008_fk_join_indexes');

  it('keeps 0008 directly after 0007', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('0008_fk_join_indexes')).toBe(
      ids.indexOf('0007_onboarding_progress_per_user') + 1,
    );
  });

  it.each([
    ['role_inheritance', 'child_role_id'],
    ['user_roles', 'role_id'],
    ['syllabus', 'cycle_id'],
    ['cycle_material_templates', 'cycle_id'],
    ['cycle_material_template_courses', 'template_id'],
  ])('indexes %s(%s) in the tenant schema', (table, column) => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(
      new RegExp(
        `CREATE INDEX IF NOT EXISTS "[^"]+"\\s+ON "tenant_x"\\.${table} \\(${column}\\)`,
      ),
    );
  });

  it('creates every index idempotently', () => {
    const sql = migration()!.up('tenant_x');
    const creates = sql.match(/CREATE INDEX/g) ?? [];
    const idempotent = sql.match(/CREATE INDEX IF NOT EXISTS/g) ?? [];
    expect(creates).toHaveLength(5);
    expect(idempotent).toHaveLength(5);
  });

  it('keeps every index name unique and within the 63-char identifier limit', () => {
    const sql = migration()!.up('tenant_x');
    const names = [
      ...sql.matchAll(/CREATE INDEX IF NOT EXISTS "([^"]+)"/g),
    ].map((m) => m[1]);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(63);
    }
  });
});

// 0009 turns the anti-repetition ledger's natural key — one row per
// (material_request_id, course_id, question_id) — into a real unique index,
// after collapsing any pre-existing duplicates (keep earliest, the 0004
// precedent). It is the conflict target for the writer's orIgnore insert.
describe('tenant migration 0009 — material_question_usage natural key', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find(
      (m) => m.id === '0009_material_question_usage_natural_key',
    );

  it('keeps 0009 directly after 0008', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('0009_material_question_usage_natural_key')).toBe(
      ids.indexOf('0008_fk_join_indexes') + 1,
    );
  });

  it('dedups existing rows BEFORE creating the unique index, keeping the earliest', () => {
    const sql = migration()!.up('tenant_x');
    const deleteAt = sql.indexOf(
      'DELETE FROM "tenant_x".material_question_usage',
    );
    const createAt = sql.indexOf('CREATE UNIQUE INDEX');
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(createAt).toBeGreaterThan(deleteAt);
    // Earliest-first tiebreak, matching the 0004 dedup precedent.
    expect(sql).toMatch(/used_at ASC,\s*id ASC/);
    expect(sql).toMatch(
      /DISTINCT ON \(material_request_id, course_id, question_id\)/,
    );
  });

  it('creates the unique natural-key index idempotently over the request/course/question triple', () => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "uq_material_question_usage_request_course_question"\s+ON "tenant_x"\.material_question_usage \(material_request_id, course_id, question_id\)/,
    );
  });

  it('keeps the index name unprefixed and within the 63-char identifier limit', () => {
    const sql = migration()!.up('tenant_x');
    const names = [
      ...sql.matchAll(/CREATE UNIQUE INDEX IF NOT EXISTS "([^"]+)"/g),
    ].map((m) => m[1]);
    expect(names).toHaveLength(1);
    expect(names[0]).not.toContain('tenant_x');
    expect(names[0].length).toBeLessThanOrEqual(63);
  });
});

// 0010 adds the billing pipeline's two source columns (spec 008 FR-007):
// page_count and file_size_bytes on material_request_courses, populated
// atomically by the completion webhook straight off the in-memory PDF
// Buffer at generation time.
describe('tenant migration 0010 — material_request_course PDF billing metrics', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find(
      (m) => m.id === '0010_material_request_course_pdf_metrics',
    );

  it('places 0010 directly after 0009', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('0010_material_request_course_pdf_metrics')).toBe(
      ids.indexOf('0009_material_question_usage_natural_key') + 1,
    );
  });

  it('adds both nullable columns idempotently via ADD COLUMN IF NOT EXISTS', () => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(/ALTER TABLE "tenant_x"\.material_request_courses/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS page_count INTEGER/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS file_size_bytes BIGINT/);
    // Neither column declares NOT NULL: pre-existing rows and non-success
    // terminal states must be able to leave them NULL.
    expect(sql).not.toMatch(/page_count INTEGER NOT NULL/);
    expect(sql).not.toMatch(/file_size_bytes BIGINT NOT NULL/);
  });
});

// 0011 replaces the plain-column UQ_syllabus_template_week_topic_subtopic
// (0001) with a NULL-safe expression index: NULL <> NULL in Postgres, so two
// rows sharing (syllabus_id, week_number, topic_id, subtopic_id) with BOTH
// template_id IS NULL never collided under the old constraint, silently
// breaking the module's Last-Write-Wins guarantee.
describe('tenant migration 0011 — syllabus_distribution NULL-safe unique index', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find(
      (m) => m.id === '0011_syllabus_distribution_null_safe_unique',
    );
  const SENTINEL = '00000000-0000-0000-0000-000000000000';

  it('places 0011 directly after 0010', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids.indexOf('0011_syllabus_distribution_null_safe_unique')).toBe(
      ids.indexOf('0010_material_request_course_pdf_metrics') + 1,
    );
  });

  it('dedups existing rows BEFORE dropping the old constraint or creating the new index, keeping the earliest', () => {
    const sql = migration()!.up('tenant_x');
    const deleteAt = sql.indexOf(
      'DELETE FROM "tenant_x".syllabus_distribution',
    );
    const dropAt = sql.indexOf('DROP CONSTRAINT IF EXISTS');
    const createAt = sql.indexOf('CREATE UNIQUE INDEX');
    expect(deleteAt).toBeGreaterThanOrEqual(0);
    expect(dropAt).toBeGreaterThan(deleteAt);
    expect(createAt).toBeGreaterThan(dropAt);
    // Earliest-first tiebreak, matching the 0004/0009 dedup precedent.
    expect(sql).toMatch(/created_at ASC,\s*id ASC/);
    expect(sql).toMatch(
      /DISTINCT ON \(\s*syllabus_id,\s*COALESCE\(template_id, '00000000-0000-0000-0000-000000000000'::uuid\),\s*week_number, topic_id, subtopic_id\s*\)/,
    );
  });

  it('drops the old plain-column constraint by its (lowercase-folded) unquoted name', () => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(
      /ALTER TABLE "tenant_x"\.syllabus_distribution\s+DROP CONSTRAINT IF EXISTS uq_syllabus_template_week_topic_subtopic;/,
    );
  });

  it('creates a NULL-safe unique index over COALESCE(template_id, sentinel) idempotently', () => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS "uq_syllabus_distribution_template_week_topic_subtopic"\s+ON "tenant_x"\.syllabus_distribution \(\s*syllabus_id,\s*COALESCE\(template_id, '00000000-0000-0000-0000-000000000000'::uuid\),\s*week_number, topic_id, subtopic_id\s*\)/,
    );
    // Sentinel must be a well-formed nil UUID, never a real template id.
    expect(sql).toContain(SENTINEL);
  });

  it('keeps the new index name unique and within the 63-char identifier limit', () => {
    const sql = migration()!.up('tenant_x');
    const names = [
      ...sql.matchAll(/CREATE UNIQUE INDEX IF NOT EXISTS "([^"]+)"/g),
    ].map((m) => m[1]);
    expect(names).toHaveLength(1);
    expect(names[0].length).toBeLessThanOrEqual(63);
  });
});

// 0012 adds the durable revocation timestamp JWT revocation is built on:
// AuthService.revokeUserTokens stamps it and JwtAuthGuard compares it against
// each token's `iat` claim.
describe('tenant migration 0012 — users tokens_valid_after', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find((m) => m.id === '0012_users_tokens_valid_after');

  it('appends 0012 as the last migration, directly after 0011', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids[ids.length - 1]).toBe('0012_users_tokens_valid_after');
    expect(ids.indexOf('0012_users_tokens_valid_after')).toBe(
      ids.indexOf('0011_syllabus_distribution_null_safe_unique') + 1,
    );
  });

  it('adds a nullable TIMESTAMPTZ column idempotently via ADD COLUMN IF NOT EXISTS', () => {
    const sql = migration()!.up('tenant_x');
    expect(sql).toMatch(/ALTER TABLE "tenant_x"\.users/);
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS tokens_valid_after TIMESTAMPTZ/,
    );
    // No default, no NOT NULL: NULL means "never revoked".
    expect(sql).not.toMatch(/tokens_valid_after TIMESTAMPTZ NOT NULL/);
    expect(sql).not.toMatch(/DEFAULT/);
  });
});
