import { Reflector } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { TENANT_MIGRATIONS } from '../database/tenant-migrations';
import { SeedSuperAdmin1784166590934 } from '../database/migrations/1784166590934-SeedSuperAdmin';
import { ALLOW_DURING_PASSWORD_RESET_KEY } from '../common/decorators/allow-password-reset.decorator';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';

/**
 * AC-016 wiring, end to end of the pieces that unit tests of a single class
 * cannot see: that the column is actually provisioned, that the seeded account
 * starts held, and that the allowlist covers exactly the routes a held account
 * needs and nothing more.
 */
describe('AC-016 force password reset — wiring', () => {
  describe('tenant schema', () => {
    it('provisions users.force_password_reset', () => {
      const sql = TENANT_MIGRATIONS.map((m) => m.up('tenant_x')).join('\n');

      expect(sql).toMatch(/force_password_reset\s+BOOLEAN\s+NOT NULL/i);
    });

    it('defaults existing rows to false, so a deploy locks nobody out', () => {
      const migration = TENANT_MIGRATIONS.find(
        (m) => m.id === '0005_users_force_password_reset',
      );

      expect(migration!.up('tenant_x')).toMatch(/DEFAULT\s+false/i);
    });

    it('keeps the list append-only: 0005 stays at its shipped position', () => {
      // 0005 was the 5th migration when it shipped; later work must append
      // after it, never reorder it.
      expect(TENANT_MIGRATIONS[4].id).toBe('0005_users_force_password_reset');
    });
  });

  // Bug 1 / Bug 2: two application-only invariants become DB constraints.
  describe('tenant migration 0006 — materials & default-design uniqueness', () => {
    it('appends 0006 directly after 0005 without reordering', () => {
      const ids = TENANT_MIGRATIONS.map((m) => m.id);
      // Strictly after 0005 — append-only, no reordering.
      expect(ids.indexOf('0006_material_and_default_design_uniqueness')).toBe(
        ids.indexOf('0005_users_force_password_reset') + 1,
      );
    });

    it('adds the materials natural-key unique index', () => {
      const migration = TENANT_MIGRATIONS.find(
        (m) => m.id === '0006_material_and_default_design_uniqueness',
      );
      const sql = migration!.up('tenant_x');
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "uq_materials_tenant_profile_week"/i,
      );
      expect(sql).toMatch(
        /ON "tenant_x"\.materials \(tenant_id, profile_id, week_number\)/i,
      );
    });

    it('adds the partial one-default-per-tenant index mirroring the entity', () => {
      const migration = TENANT_MIGRATIONS.find(
        (m) => m.id === '0006_material_and_default_design_uniqueness',
      );
      const sql = migration!.up('tenant_x');
      // Same index name the entity declares, so the two never collide.
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "idx_tenant_default"/i,
      );
      expect(sql).toMatch(/WHERE is_default = true/i);
    });

    it('is idempotent and re-runnable (IF NOT EXISTS on every index)', () => {
      const migration = TENANT_MIGRATIONS.find(
        (m) => m.id === '0006_material_and_default_design_uniqueness',
      );
      const sql = migration!.up('tenant_x');
      const creates = sql.match(/CREATE UNIQUE INDEX/gi) || [];
      const guarded = sql.match(/CREATE UNIQUE INDEX IF NOT EXISTS/gi) || [];
      expect(creates.length).toBe(2);
      expect(guarded.length).toBe(creates.length);
    });
  });

  // A schema provisioned before 0004 could already hold more than one
  // onboarding_progress row; the singleton UNIQUE index would then fail and
  // roll back the migration. 0004 must collapse duplicates first.
  describe('tenant migration 0004 — onboarding singleton dedup', () => {
    const sql = () =>
      TENANT_MIGRATIONS.find(
        (m) => m.id === '0004_tenant_integrity_constraints',
      )!.up('tenant_x');

    it('deletes duplicate onboarding rows keeping the earliest (created_at ASC, id ASC)', () => {
      const body = sql();
      expect(body).toMatch(/DELETE FROM "tenant_x"\.onboarding_progress/i);
      expect(body).toMatch(
        /WHERE id NOT IN \(\s*SELECT id FROM "tenant_x"\.onboarding_progress\s*ORDER BY created_at ASC, id ASC\s*LIMIT 1\s*\)/i,
      );
    });

    it('dedups before creating the singleton unique index, or the index would fail', () => {
      const body = sql();
      const deletePos = body.search(
        /DELETE FROM "tenant_x"\.onboarding_progress/i,
      );
      const indexPos = body.search(
        /CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_progress_singleton"/i,
      );
      expect(deletePos).toBeGreaterThanOrEqual(0);
      expect(indexPos).toBeGreaterThanOrEqual(0);
      expect(deletePos).toBeLessThan(indexPos);
    });
  });

  // Onboarding dismissal moves from a per-tenant singleton (0004) to per-user
  // (0007). 0007 must sit directly after 0006 (the list is append-only), drop
  // the singleton machinery, and key the row on user_id.
  describe('tenant migration 0007 — onboarding dismissal per user', () => {
    const migration = () =>
      TENANT_MIGRATIONS.find(
        (m) => m.id === '0007_onboarding_progress_per_user',
      );

    it('appends 0007 directly after 0006', () => {
      const ids = TENANT_MIGRATIONS.map((m) => m.id);
      expect(ids.indexOf('0007_onboarding_progress_per_user')).toBe(
        ids.indexOf('0006_material_and_default_design_uniqueness') + 1,
      );
    });

    it('drops the singleton machinery introduced in 0004', () => {
      const sql = migration()!.up('tenant_x');
      expect(sql).toMatch(
        /DROP INDEX IF EXISTS "tenant_x"\."uq_onboarding_progress_singleton"/i,
      );
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS chk_onboarding_progress_singleton/i,
      );
      expect(sql).toMatch(/DROP COLUMN IF EXISTS singleton/i);
    });

    it('resets the old unattributed rows before adding the NOT NULL user_id column', () => {
      const sql = migration()!.up('tenant_x');
      const deletePos = sql.search(
        /DELETE FROM "tenant_x"\.onboarding_progress/i,
      );
      const addColumnPos = sql.search(
        /ADD COLUMN IF NOT EXISTS user_id UUID NOT NULL/i,
      );
      expect(deletePos).toBeGreaterThanOrEqual(0);
      expect(addColumnPos).toBeGreaterThanOrEqual(0);
      // The table must be emptied first, or a NOT NULL column would reject the
      // pre-existing unattributed rows.
      expect(deletePos).toBeLessThan(addColumnPos);
    });

    it('adds the per-user unique index and a cascading FK to tenant users', () => {
      const sql = migration()!.up('tenant_x');
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_progress_user"\s*ON "tenant_x"\.onboarding_progress \(user_id\)/i,
      );
      expect(sql).toMatch(
        /FOREIGN KEY \(user_id\) REFERENCES "tenant_x"\.users\(id\) ON DELETE CASCADE/i,
      );
    });

    it('is idempotent and re-runnable (guarded add/drop everywhere)', () => {
      const sql = migration()!.up('tenant_x');
      expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS user_id/i);
      expect(sql).toMatch(
        /DROP CONSTRAINT IF EXISTS fk_onboarding_progress_user/i,
      );
      expect(sql).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS "uq_onboarding_progress_user"/i,
      );
    });
  });

  describe('super admin seed', () => {
    // The seed picks the password, so the human who receives it must replace it.
    it('inserts the super admin already held for a password change', async () => {
      const queries: Array<{ sql: string; params?: any[] }> = [];
      const queryRunner: any = {
        query: jest.fn(async (sql: string, params?: any[]) => {
          queries.push({ sql, params });
          // Only the RETURNING id statements are read back by the migration.
          return [{ id: '00000000-0000-0000-0000-0000000000ff' }];
        }),
      };

      await new SeedSuperAdmin1784166590934().up(queryRunner);

      const userInsert = queries.find(
        (q) => /INSERT INTO/i.test(q.sql) && /\.users\s*\(/i.test(q.sql),
      );
      expect(userInsert).toBeDefined();
      expect(userInsert!.sql).toContain('force_password_reset');
      expect(userInsert!.sql).toMatch(/VALUES\s*\([^)]*true\s*\)/);
    });

    it('runs the tenant migrations before that insert, so the column exists', async () => {
      const queries: string[] = [];
      const queryRunner: any = {
        query: jest.fn(async (sql: string) => {
          queries.push(sql);
          return [{ id: '00000000-0000-0000-0000-0000000000ff' }];
        }),
      };

      await new SeedSuperAdmin1784166590934().up(queryRunner);

      const columnAdded = queries.findIndex((sql) =>
        /ADD COLUMN IF NOT EXISTS force_password_reset/i.test(sql),
      );
      const userInserted = queries.findIndex(
        (sql) => /INSERT INTO/i.test(sql) && /\.users\s*\(/i.test(sql),
      );
      expect(columnAdded).toBeGreaterThanOrEqual(0);
      expect(columnAdded).toBeLessThan(userInserted);
    });
  });

  describe('allowlist', () => {
    const reflector = new Reflector();
    const proto = AuthController.prototype as any;

    const allowed = (method: string) =>
      reflector.getAllAndOverride<boolean>(ALLOW_DURING_PASSWORD_RESET_KEY, [
        proto[method],
        AuthController,
      ]) === true;

    it.each(['changePassword', 'me', 'logout'])(
      'allows %s while the account is held',
      (method) => {
        expect(allowed(method)).toBe(true);
      },
    );

    it('does not allowlist anything beyond those three', () => {
      const handlers = Object.getOwnPropertyNames(proto).filter(
        (name) => name !== 'constructor' && typeof proto[name] === 'function',
      );

      expect(handlers.filter(allowed).sort()).toEqual([
        'changePassword',
        'logout',
        'me',
      ]);
    });

    // change-password requires a session: it reads the caller's identity from
    // the JWT, and marking it @Public() would let anyone reset anyone.
    it('does not make change-password public', () => {
      expect(
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
          proto.changePassword,
          AuthController,
        ]),
      ).not.toBe(true);
    });
  });
});
