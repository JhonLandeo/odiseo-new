import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { TenantMigrationService } from './tenant-migration.service';

/**
 * CLI entrypoint — applies the pending tenant migrations to EVERY existing
 * tenant schema.
 *
 * Run this on deploy, right after the main-DB `migration:run`, whenever a new
 * migration has been appended to `TENANT_MIGRATIONS`. It mirrors that same
 * operator-run discipline: it is intentionally NOT wired into application boot,
 * because migrating on startup would block the process coming up and let every
 * API/worker replica race the same schemas. Wiring it into the deploy pipeline
 * (or a guarded, single-runner boot hook) is the ops follow-up.
 *
 *   node dist/database/run-tenant-migrations         (compiled)
 *   npm run migration:run:tenants                    (ts-node, mirrors migration:run)
 *
 * Exits non-zero if any tenant failed, so a deploy step can fail loudly.
 */
async function bootstrap() {
  const logger = new Logger('RunTenantMigrations');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  let failed = false;
  try {
    const service = app.get(TenantMigrationService);
    const summary = await service.runMigrationsForAllTenants();

    logger.log(
      `Done: ${summary.migrated} migrated, ${summary.skipped} skipped, ` +
        `${summary.failed} failed (of ${summary.total} tenant(s))`,
    );

    if (summary.failed > 0) {
      failed = true;
      for (const failure of summary.failures) {
        logger.error(`  ${failure.schemaName}: ${failure.error}`);
      }
    }
  } catch (error) {
    failed = true;
    logger.error('Tenant migration fan-out crashed', error as Error);
  } finally {
    await app.close();
  }

  process.exit(failed ? 1 : 0);
}

void bootstrap();
