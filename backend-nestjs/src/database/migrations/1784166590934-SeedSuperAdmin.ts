import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { TENANT_MIGRATIONS } from '../tenant-migrations';
import { TENANT_SUPER_ADMIN_PERMISSIONS } from '../../admin/roles/constants/permissions.constant';
import { resolveSeedPassword } from '../seed-superadmin-password';

export class SeedSuperAdmin1784166590934 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Insert Subscription Plan
    const planRes = await queryRunner.query(
      `INSERT INTO public.subscription_plans (name, price, max_users, max_pdf_pages_per_month, max_questions_per_month) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Free', 0, 10, 100, 100],
    );
    const planId = planRes[0].id;

    // 2. Insert Super Admin Company (Tenant)
    const sysInsert = await queryRunner.query(
      `INSERT INTO public.companies (subdomain, commercial_name, primary_color, is_active, subscription_plan_id) VALUES ($1, $2, $3, true, $4) RETURNING id`,
      ['odiseo', 'Odiseo SaaS', '#000000', planId],
    );
    const sysCompanyId = sysInsert[0].id;
    const sysSchema = `tenant_${sysCompanyId}`;

    // 3. Create Schema
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${sysSchema}"`);

    // 4. Provision the schema through the tenant migration runner.
    //
    // This used to inline four CREATE TABLE statements, which produced a tenant
    // with 4 of the 19 tables and no `_tenant_migrations` ledger — so every
    // business feature failed with "relation does not exist", and later
    // migrations had no record of what this schema had already applied. The
    // ordered list in `tenant-migrations/` is the single source of truth for
    // tenant structure; duplicating a subset of it here guaranteed drift.
    //
    // Applied in the ambient migration transaction rather than one transaction
    // per step (as TenantMigrationService does), so a failure here rolls the
    // whole seed back instead of leaving a half-provisioned tenant.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${sysSchema}"._tenant_migrations (
        id VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
      );
    `);
    for (const migration of TENANT_MIGRATIONS) {
      await queryRunner.query(migration.up(sysSchema));
      await queryRunner.query(
        `INSERT INTO "${sysSchema}"._tenant_migrations (id) VALUES ($1)`,
        [migration.id],
      );
    }

    // 5. Insert super admin role.
    //
    // Uses the canonical vocabulary rather than a copied literal. The previous
    // hardcoded list had drifted to 7 of the 15 permissions — missing
    // VIEW_ACADEMIC_TIME and VIEW_CATALOGS among others — so a freshly seeded
    // Super Admin was denied the very pages the frontend guards on.
    const superAdminPermsJSON = JSON.stringify(TENANT_SUPER_ADMIN_PERMISSIONS);
    const sysRoleRes = await queryRunner.query(
      `
            INSERT INTO "${sysSchema}".roles (name, description, is_system_default, permissions)
            VALUES ('Super Admin', 'System Owner', true, $1::jsonb) RETURNING id;
        `,
      [superAdminPermsJSON],
    );
    const sysRoleId = sysRoleRes[0].id;

    // 6. Insert super admin user.
    //
    // The credentials used to be literals in this file, committed to the
    // repository, for an account holding every platform permission — and this
    // migration runs in production exactly as it does locally. They now come
    // from the environment.
    //
    // Production must supply them explicitly: failing the migration is the only
    // outcome that cannot end with a publicly known password on a live super
    // admin. Outside production a missing password is generated and printed
    // once, so local setup stays a single command and still never ships a
    // shared secret.
    const sysEmail = process.env.SEED_SUPERADMIN_EMAIL ?? 'superadmin@odiseo.com';
    const sysPass = resolveSeedPassword();
    const sysPassHash = await bcrypt.hash(sysPass, 10);
    const sysUserInsert = await queryRunner.query(
      `INSERT INTO "${sysSchema}".users (email, password_hash, name, company_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [sysEmail, sysPassHash, 'Super Administrador', sysCompanyId],
    );
    const sysUserId = sysUserInsert[0].id;

    // 7. Assign role
    await queryRunner.query(
      `INSERT INTO "${sysSchema}".user_roles (user_id, role_id) VALUES ($1, $2)`,
      [sysUserId, sysRoleId],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // En un rollback, idealmente borraríamos el esquema tenant del super admin y el plan
    const sysCompany = await queryRunner.query(
      `SELECT id FROM public.companies WHERE subdomain = 'odiseo'`,
    );
    if (sysCompany.length > 0) {
      const sysSchema = `tenant_${sysCompany[0].id}`;
      await queryRunner.query(`DROP SCHEMA IF EXISTS "${sysSchema}" CASCADE`);
      await queryRunner.query(`DELETE FROM public.companies WHERE id = $1`, [
        sysCompany[0].id,
      ]);
    }
    await queryRunner.query(
      `DELETE FROM public.subscription_plans WHERE name = 'Free'`,
    );
  }
}
