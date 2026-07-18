import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertValidSchema } from './schema-name.util';
import { TENANT_MIGRATIONS } from './tenant-migrations';

/**
 * Applies the ordered tenant DDL migrations to a single tenant schema.
 *
 * Each schema tracks its applied migrations in a local `_tenant_migrations`
 * table, so the runner is safe to call repeatedly: on a fresh schema it applies
 * everything, on an existing one it applies only what is missing. This is the
 * mechanism that keeps every tenant's structure in lock-step with the single
 * source of truth in `tenant-migrations/`.
 */
@Injectable()
export class TenantMigrationService {
  private readonly logger = new Logger(TenantMigrationService.name);

  constructor(private readonly dataSource: DataSource) {}

  async runMigrations(schemaName: string): Promise<void> {
    assertValidSchema(schemaName);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS "${schemaName}"._tenant_migrations (
          id VARCHAR(255) PRIMARY KEY,
          executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );
      `);

      const appliedRows: Array<{ id: string }> = await queryRunner.query(
        `SELECT id FROM "${schemaName}"._tenant_migrations`,
      );
      const applied = new Set(appliedRows.map((r) => r.id));

      for (const migration of TENANT_MIGRATIONS) {
        if (applied.has(migration.id)) {
          continue;
        }

        await queryRunner.startTransaction();
        try {
          await queryRunner.query(migration.up(schemaName));
          await queryRunner.query(
            `INSERT INTO "${schemaName}"._tenant_migrations (id) VALUES ($1)`,
            [migration.id],
          );
          await queryRunner.commitTransaction();
          this.logger.log(
            `Applied tenant migration "${migration.id}" on schema "${schemaName}"`,
          );
        } catch (error) {
          await queryRunner.rollbackTransaction();
          this.logger.error(
            `Failed tenant migration "${migration.id}" on schema "${schemaName}"`,
            error,
          );
          throw error;
        }
      }
    } finally {
      await queryRunner.release();
    }
  }
}
