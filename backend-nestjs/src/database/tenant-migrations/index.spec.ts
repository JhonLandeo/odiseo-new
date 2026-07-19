import { TENANT_MIGRATIONS } from './index';

// 0008 backfills the FK-side btree indexes the hot joins were missing. The
// list is append-only, so the migration must land last and stay idempotent
// like every other entry.
describe('tenant migration 0008 — FK join indexes', () => {
  const migration = () =>
    TENANT_MIGRATIONS.find((m) => m.id === '0008_fk_join_indexes');

  it('appends 0008 as the last migration, directly after 0007', () => {
    const ids = TENANT_MIGRATIONS.map((m) => m.id);
    expect(ids[ids.length - 1]).toBe('0008_fk_join_indexes');
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
