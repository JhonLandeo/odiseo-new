import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { assertValidSchema } from './schema-name.util';
import { TENANT_MIGRATIONS } from './tenant-migrations';

/**
 * Outcome of fanning the tenant migrations out across every provisioned tenant.
 * `failures` carries the schema + error message for each tenant that threw, so
 * the operator (and the CLI's exit code) can act on a partial failure.
 */
export interface TenantMigrationSummary {
  total: number;
  migrated: number;
  skipped: number;
  failed: number;
  failures: Array<{ schemaName: string; error: string }>;
}

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

  /**
   * Fans the pending tenant migrations out across EVERY already-provisioned
   * tenant schema — the piece that keeps existing tenants in lock-step with the
   * `TENANT_MIGRATIONS` source of truth after a new migration is appended.
   *
   * Deliberately operator-run (a CLI on deploy), NOT an on-boot hook: doing this
   * on startup would block the process coming up and race across API/worker
   * replicas all trying to migrate the same schemas at once. It mirrors the
   * discipline of the main-DB `migration:run`.
   *
   * Resilient by construction: a schema that does not exist (a company whose
   * provisioning failed) is SKIPPED with a warning, and a failure on one tenant
   * is logged and counted but never aborts the run — the remaining tenants are
   * still migrated. The returned summary reports migrated / skipped / failed.
   */
  async runMigrationsForAllTenants(): Promise<TenantMigrationSummary> {
    const companies: Array<{ id: string }> = await this.dataSource.query(
      `SELECT id FROM public.companies`,
    );

    const summary: TenantMigrationSummary = {
      total: companies.length,
      migrated: 0,
      skipped: 0,
      failed: 0,
      failures: [],
    };

    for (const company of companies) {
      const schemaName = `tenant_${company.id}`;

      try {
        if (!(await this.schemaExists(schemaName))) {
          this.logger.warn(
            `Skipping "${schemaName}": schema does not exist (provisioning may have failed)`,
          );
          summary.skipped += 1;
          continue;
        }

        // Serialize concurrent fan-out runs on the same schema with a
        // session-level advisory lock. A second run (a racing deploy) blocks
        // here until the first releases, rather than both racing the same DDL.
        await this.withSchemaLock(schemaName, () =>
          this.runMigrations(schemaName),
        );
        summary.migrated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to migrate tenant schema "${schemaName}": ${message}`,
        );
        summary.failed += 1;
        summary.failures.push({ schemaName, error: message });
      }
    }

    this.logger.log(
      `Tenant migration fan-out finished: ${summary.migrated} migrated, ` +
        `${summary.skipped} skipped, ${summary.failed} failed ` +
        `(of ${summary.total} tenant(s))`,
    );

    return summary;
  }

  /** Whether a Postgres schema physically exists. */
  private async schemaExists(schemaName: string): Promise<boolean> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT 1 FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName],
    );
    return rows.length > 0;
  }

  /**
   * Runs `fn` while holding a session-level Postgres advisory lock keyed on the
   * schema name, so two concurrent callers cannot apply DDL to the same schema
   * at once. The lock is held on its own connection (separate from the one
   * `runMigrations` uses) and always released.
   *
   * Public: the fan-out above uses it to serialize concurrent deploys, and
   * TenantProvisioningProcessor uses it to serialize concurrent executions of
   * the SAME job that BullMQ's stalled-job recovery can otherwise hand out
   * twice (a missed lock-extension heartbeat during slow DDL, or a worker
   * restart mid-job) — without it, two concurrent runs both see an empty
   * `_tenant_migrations` table and race the same INSERT.
   */
  async withSchemaLock<T>(
    schemaName: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const lockRunner = this.dataSource.createQueryRunner();
    await lockRunner.connect();
    try {
      // hashtextextended(..., 0) gives a 64-bit hash rather than hashtext's
      // 32-bit one — at a 32-bit width, the birthday bound puts collision
      // odds at the low single-digit percent by ~10k tenants, which would
      // needlessly serialize two unrelated schemas' DDL against each other.
      await lockRunner.query(
        `SELECT pg_advisory_lock(hashtextextended($1, 0))`,
        [schemaName],
      );
      return await fn();
    } finally {
      try {
        await lockRunner.query(
          `SELECT pg_advisory_unlock(hashtextextended($1, 0))`,
          [schemaName],
        );
      } finally {
        await lockRunner.release();
      }
    }
  }
}
