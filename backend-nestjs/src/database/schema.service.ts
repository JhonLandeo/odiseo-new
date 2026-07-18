import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertValidSchema } from './schema-name.util';
import { TenantMigrationService } from './tenant-migration.service';
import { TENANT_SUPER_ADMIN_PERMISSIONS } from '../admin/roles/constants/permissions.constant';

@Injectable()
export class SchemaService {
  private readonly logger = new Logger(SchemaService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantMigrationService: TenantMigrationService,
  ) {}

  /**
   * Creates a new PostgreSQL schema for a given tenant.
   * @param schemaName The name of the schema (typically the tenant's subdomain).
   */
  async createTenantSchema(schemaName: string): Promise<void> {
    assertValidSchema(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      this.logger.log(`Provisioning schema for tenant: ${schemaName}`);
      await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
      this.logger.log(`Schema "${schemaName}" provisioned successfully`);
    } catch (error) {
      this.logger.error(`Error provisioning schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Builds the tenant's structure by running the ordered tenant migrations
   * (single source of truth) and seeds the default system role idempotently.
   */
  async seedTenantSchema(schemaName: string, companyId: string): Promise<void> {
    assertValidSchema(schemaName);
    this.logger.log(
      `Seeding tables and initial data for tenant: ${schemaName}`,
    );

    // 1. Create base tables via the versioned tenant migration runner.
    await this.tenantMigrationService.runMigrations(schemaName);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // 2. Seed the default Super Admin (Director) role.
      // ON CONFLICT keeps this idempotent when the runner re-visits an existing
      // schema (roles.name is UNIQUE). No user is seeded here (FR-08: decoupled
      // admin creation). Permissions use the canonical UPPERCASE vocabulary that
      // the PermissionsGuard enforces (single source of truth).
      const superAdminPermsJSON = JSON.stringify(
        TENANT_SUPER_ADMIN_PERMISSIONS,
      );
      await queryRunner.query(
        `
        INSERT INTO "${schemaName}".roles (name, description, is_system_default, permissions)
        VALUES ('Super Administrador', 'Administrador Principal de la Institución', true, $1::jsonb)
        ON CONFLICT (name) DO NOTHING;
      `,
        [superAdminPermsJSON],
      );

      this.logger.log(`Tenant "${schemaName}" seeded successfully`);
    } catch (error) {
      this.logger.error(`Error seeding schema "${schemaName}":`, error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
