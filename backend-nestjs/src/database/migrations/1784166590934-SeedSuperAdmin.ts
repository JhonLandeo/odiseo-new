import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

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

    // 4. Create base tables for system tenant
    await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "${sysSchema}".users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                name VARCHAR(255) NOT NULL,
                company_id UUID NOT NULL,
                is_active BOOLEAN NOT NULL DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS "${sysSchema}".roles (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                name VARCHAR(255) UNIQUE NOT NULL,
                description TEXT,
                is_system_default BOOLEAN DEFAULT false,
                permissions JSONB DEFAULT '[]'::jsonb,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
            );
            CREATE TABLE IF NOT EXISTS "${sysSchema}".role_inheritance (
                parent_role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE RESTRICT,
                child_role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE CASCADE,
                PRIMARY KEY (parent_role_id, child_role_id)
            );
            CREATE TABLE IF NOT EXISTS "${sysSchema}".user_roles (
                user_id UUID REFERENCES "${sysSchema}".users(id) ON DELETE CASCADE,
                role_id UUID REFERENCES "${sysSchema}".roles(id) ON DELETE RESTRICT,
                assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
                PRIMARY KEY (user_id, role_id)
            );
        `);

    // 5. Insert super admin role
    const superAdminPermsJSON = JSON.stringify([
      'MANAGE_ROLES',
      'MANAGE_USERS',
      'VIEW_SYLLABUS',
      'EDIT_SYLLABUS',
      'VIEW_MATERIALS',
      'EDIT_MATERIALS',
      'MANAGE_TENANTS',
    ]);
    const sysRoleRes = await queryRunner.query(
      `
            INSERT INTO "${sysSchema}".roles (name, description, is_system_default, permissions) 
            VALUES ('Super Admin', 'System Owner', true, $1::jsonb) RETURNING id;
        `,
      [superAdminPermsJSON],
    );
    const sysRoleId = sysRoleRes[0].id;

    // 6. Insert super admin user
    const sysEmail = 'superadmin@odiseo.com';
    const sysPass = 'superadmin123';
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
