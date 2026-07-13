import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Creates a new PostgreSQL schema for a given tenant.
   * @param schemaName The name of the schema (typically the tenant's subdomain).
   */
  async createTenantSchema(schemaName: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Provisioning schema for tenant: ${schemaName}`);
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      // Here we could also run migrations programmatically if needed.
      this.logger.log(`Schema "${schemaName}" provisioned successfully`);
    } catch (error) {
      this.logger.error(`Error provisioning schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Creates the base tables and the first user for a newly provisioned tenant.
   */
  async seedTenantSchema(
    schemaName: string,
    companyId: string,
    adminEmail: string,
    adminPasswordHash: string,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Seeding tables and initial data for tenant: ${schemaName}`);

      // 1. Create base tables
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}".users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255) NOT NULL,
          company_id UUID NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) UNIQUE NOT NULL,
          description TEXT,
          is_system_default BOOLEAN DEFAULT false,
          permissions JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".role_inheritance (
          parent_role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE RESTRICT,
          child_role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE CASCADE,
          PRIMARY KEY (parent_role_id, child_role_id)
        );
        CREATE TABLE IF NOT EXISTS "${schemaName}".user_roles (
          user_id UUID REFERENCES "${schemaName}".users(id) ON DELETE CASCADE,
          role_id UUID REFERENCES "${schemaName}".roles(id) ON DELETE RESTRICT,
          assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
          PRIMARY KEY (user_id, role_id)
        );
      `);

      // 2. Insert Super Admin (Director) Role
      const superAdminPermsJSON = JSON.stringify([
        'view_catalogs',
        'edit_catalogs',
        'view_materials',
        'generate_material',
        'review_material',
        'view_syllabus',
        'edit_syllabus',
        'manage_academic_time',
      ]);
      const sysRoleRes = await queryRunner.query(`
        INSERT INTO "${schemaName}".roles (name, description, is_system_default, permissions) 
        VALUES ('Director', 'Administrador Principal de la Institución', true, $1::jsonb) RETURNING id;
      `, [superAdminPermsJSON]);
      const sysRoleId = sysRoleRes[0].id;

      // 3. Insert user
      const sysUserInsert = await queryRunner.query(
        `INSERT INTO "${schemaName}".users (email, password_hash, name, company_id, is_active) VALUES ($1, $2, $3, $4, true) RETURNING id`,
        [adminEmail, adminPasswordHash, 'Director General', companyId]
      );
      const sysUserId = sysUserInsert[0].id;

      // 4. Assign role
      await queryRunner.query(`INSERT INTO "${schemaName}".user_roles (user_id, role_id) VALUES ($1, $2)`, [sysUserId, sysRoleId]);

      this.logger.log(`Tenant "${schemaName}" seeded successfully`);
    } catch (error) {
      this.logger.error(`Error seeding schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
