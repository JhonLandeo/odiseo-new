import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { TenantService } from '../../database/tenant.service';
import { Company } from '../../tenants/entities/tenant.entity';
import { DISTRIBUTED_LOCK } from '../../common/locking/distributed-lock.interface';
import type { DistributedLock } from '../../common/locking/distributed-lock.interface';
import {
  mapWithConcurrency,
  SCHEMA_FANOUT_CONCURRENCY,
} from '../../common/utils/map-with-concurrency.util';

const METRIC_ACTIVE_USERS = 'active_users';
const METRIC_QUESTIONS_USED = 'questions_used';
const METRIC_PDF_PAGES_GENERATED = 'pdf_pages_generated';
const METRIC_STORAGE_MB = 'storage_mb';

const BYTES_PER_MB = 1024 * 1024;

/**
 * Asynchronous monthly consumption-metrics collector (spec 008 FR-007,
 * clarification "Asincronía Extrema" + SC-002 <=1h dashboard staleness).
 *
 * This is the pipeline that fills `public.consumption_metrics`, the table
 * `DashboardService.getMetrics` reads from. It runs OFF the request path on
 * purpose: fanning out one query per tenant schema on every dashboard read
 * does not scale past a handful of tenants, and metrics are defined as
 * monthly accumulators (spec clarification "Opción B - Mensual"), not a
 * live/real-time figure — an hourly refresh comfortably meets the 1h budget.
 */
@Injectable()
export class ConsumptionMetricsCron {
  private readonly logger = new Logger(ConsumptionMetricsCron.name);

  // Must stay under the hourly schedule interval, per DistributedLock's
  // contract ("pick a TTL longer than the job but shorter than the schedule
  // interval") — otherwise a slow run could still be holding the lock when
  // the next tick fires, starving that tick for no reason (the lock is never
  // released early, only expires on TTL).
  private static readonly LOCK_TTL_MS = 45 * 60 * 1000;

  private static readonly LOCK_KEY = 'cron:consumption-metrics:collect';

  constructor(
    private readonly tenantService: TenantService,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    @Inject(DISTRIBUTED_LOCK)
    private readonly lock: DistributedLock,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleCron() {
    // Registered in every process/replica like MaterialsCron; the lock keeps
    // N replicas from each fanning out the same collection run in the same
    // tick.
    await this.lock.runExclusively(
      ConsumptionMetricsCron.LOCK_KEY,
      ConsumptionMetricsCron.LOCK_TTL_MS,
      () => this.collectForAllTenants(),
    );
  }

  private async collectForAllTenants(): Promise<void> {
    this.logger.log('Running monthly consumption-metrics collection (cron)');

    const companies = await this.entityManager.find(Company, {
      where: { isActive: true },
    });

    if (companies.length === 0) {
      this.logger.warn(
        'No active company found. Skipping consumption-metrics collection.',
      );
      return;
    }

    const now = new Date();
    const billingYear = now.getUTCFullYear();
    const billingMonth = now.getUTCMonth() + 1;

    // Bounded fan-out, same concurrency ceiling the (now-deleted) request-path
    // fan-out used — this is the same amount of cross-schema work, just moved
    // off the request path and onto an hourly tick.
    await mapWithConcurrency(
      companies,
      SCHEMA_FANOUT_CONCURRENCY,
      async (company) => {
        try {
          await this.collectForTenant(company.id, billingYear, billingMonth);
        } catch (error: any) {
          // One tenant's schema being mid-migration or unreachable must not
          // abort the run for every other tenant (same tolerance as
          // DashboardService's former fan-out and MaterialsCron).
          this.logger.warn(
            `Consumption-metrics collection failed for tenant ${company.id}: ${error.message}`,
          );
        }
      },
    );
  }

  private async collectForTenant(
    tenantId: string,
    billingYear: number,
    billingMonth: number,
  ): Promise<void> {
    const schemaName = `tenant_${tenantId}`;
    const monthStart = new Date(Date.UTC(billingYear, billingMonth - 1, 1));
    const monthEndExclusive = new Date(Date.UTC(billingYear, billingMonth, 1));

    const metrics = await this.tenantService.runInSchema(
      schemaName,
      async (manager) => {
        const activeUsersRows: Array<{ count: string }> = await manager.query(
          `SELECT COUNT(*) FROM "${schemaName}".users WHERE is_active = true`,
        );

        const questionsUsedRows: Array<{ count: string }> = await manager.query(
          `SELECT COUNT(*) FROM "${schemaName}".material_question_usage
             WHERE used_at >= $1 AND used_at < $2`,
          [monthStart, monthEndExclusive],
        );

        // Scoped by completed_at, NOT created_at: created_at is when the
        // request was submitted, but a course near a month boundary can
        // finish generating in the FOLLOWING month. Scoping by created_at
        // would drop that row from every month's bucket permanently (this
        // was a real bug, corrected before ever shipping).
        const pdfPagesRows: Array<{ total: string }> = await manager.query(
          `SELECT COALESCE(SUM(page_count), 0) AS total
           FROM "${schemaName}".material_request_courses
           WHERE completed_at >= $1 AND completed_at < $2`,
          [monthStart, monthEndExclusive],
        );

        // DB storage component: physical size of every table/index/toast in
        // the tenant's own schema. The schema name is passed as a bound VALUE
        // compared against pg_namespace.nspname, never interpolated into the
        // SQL text, so this carries no injection risk beyond what
        // `runInSchema` (assertValidSchema) already guarantees for the schema
        // this connection is even allowed to touch.
        const dbStorageRows: Array<{ bytes: string }> = await manager.query(
          `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0) AS bytes
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1`,
          [schemaName],
        );

        // S3 storage component: cumulative for ALL TIME, not scoped to the
        // current month — every material ever generated still occupies S3
        // space, unlike the flow-metrics above which reset each billing
        // period.
        const s3StorageRows: Array<{ bytes: string }> = await manager.query(
          `SELECT COALESCE(SUM(file_size_bytes), 0) AS bytes
           FROM "${schemaName}".material_request_courses`,
        );

        const dbBytes = parseInt(dbStorageRows[0].bytes, 10);
        const s3Bytes = parseInt(s3StorageRows[0].bytes, 10);
        const storageMb = (dbBytes + s3Bytes) / BYTES_PER_MB;

        return {
          activeUsers: parseInt(activeUsersRows[0].count, 10),
          questionsUsed: parseInt(questionsUsedRows[0].count, 10),
          pdfPagesGenerated: parseInt(pdfPagesRows[0].total, 10),
          storageMb,
        };
      },
    );

    await Promise.all([
      this.upsertMetric(
        tenantId,
        METRIC_ACTIVE_USERS,
        metrics.activeUsers,
        billingMonth,
        billingYear,
      ),
      this.upsertMetric(
        tenantId,
        METRIC_QUESTIONS_USED,
        metrics.questionsUsed,
        billingMonth,
        billingYear,
      ),
      this.upsertMetric(
        tenantId,
        METRIC_PDF_PAGES_GENERATED,
        metrics.pdfPagesGenerated,
        billingMonth,
        billingYear,
      ),
      this.upsertMetric(
        tenantId,
        METRIC_STORAGE_MB,
        metrics.storageMb,
        billingMonth,
        billingYear,
      ),
    ]);
  }

  /**
   * Upserts one `public.consumption_metrics` row against the UNIQUE index
   * added by migration `ConsumptionMetricsUpsertIndex1784400000000`
   * (tenant_id, metric_type, billing_month, billing_year) — the target this
   * `ON CONFLICT` needs. Each metric is a monthly accumulator (spec
   * clarification "Opción B - Mensual"), so a re-run of the same tick simply
   * overwrites the value rather than accumulating duplicate rows.
   */
  private async upsertMetric(
    tenantId: string,
    metricType: string,
    value: number,
    billingMonth: number,
    billingYear: number,
  ): Promise<void> {
    await this.entityManager.query(
      `INSERT INTO public.consumption_metrics
         (tenant_id, metric_type, value, billing_month, billing_year)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, metric_type, billing_month, billing_year)
       DO UPDATE SET value = EXCLUDED.value`,
      [tenantId, metricType, Math.round(value), billingMonth, billingYear],
    );
  }
}
