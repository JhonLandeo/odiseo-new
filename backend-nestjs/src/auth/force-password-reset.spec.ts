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

    it('keeps the list append-only: 0005 is last', () => {
      expect(TENANT_MIGRATIONS[TENANT_MIGRATIONS.length - 1].id).toBe(
        '0005_users_force_password_reset',
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
