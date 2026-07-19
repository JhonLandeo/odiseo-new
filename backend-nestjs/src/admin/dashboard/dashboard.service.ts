import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumptionMetric } from './entities/consumption-metric.entity';
import { TenantService } from '../../database/tenant.service';
import {
  mapWithConcurrency,
  SCHEMA_FANOUT_CONCURRENCY,
} from '../../common/utils/map-with-concurrency.util';

interface TenantMetrics {
  activeUsers: number;
  questionsUsed: number;
}

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ConsumptionMetric)
    private readonly metricRepository: Repository<ConsumptionMetric>,
    private readonly tenantService: TenantService,
  ) {}

  async getMetrics(tenantId: string, startDate?: string, endDate?: string) {
    const range = this.parseDateRange(startDate, endDate);
    let totals: TenantMetrics;

    if (tenantId === 'all') {
      const companies: Array<{ id: string }> =
        await this.metricRepository.manager.query(
          `SELECT id FROM public.companies WHERE is_active = true`,
        );

      // Per-tenant tolerance is deliberate here: this is an aggregate across the
      // whole platform, so a single tenant whose schema is missing or mid-
      // migration must not blank out the number for every other tenant.
      const perTenant = await mapWithConcurrency(
        companies,
        SCHEMA_FANOUT_CONCURRENCY,
        async (comp) => {
          try {
            return await this.collectTenantMetrics(`tenant_${comp.id}`, range);
          } catch (e) {
            this.logger.warn(
              `Schema tenant_${comp.id} not available for metrics: ${(e as Error).message}`,
            );
            return { activeUsers: 0, questionsUsed: 0 };
          }
        },
      );
      totals = perTenant.reduce(
        (sum, m) => ({
          activeUsers: sum.activeUsers + m.activeUsers,
          questionsUsed: sum.questionsUsed + m.questionsUsed,
        }),
        { activeUsers: 0, questionsUsed: 0 },
      );
    } else {
      if (!tenantId) {
        throw new BadRequestException('tenant_id is required');
      }

      // No try/catch on purpose: for a single tenant, reporting zeros when the
      // query actually failed is indistinguishable from a real zero and hides
      // outages. Let the failure surface as a 5xx.
      totals = await this.collectTenantMetrics(`tenant_${tenantId}`, range);
    }

    return {
      active_users: totals.activeUsers,
      // Real processing volume per spec 008 FR-007 ("cantidad de preguntas
      // consumidas"): every row in material_question_usage is one question
      // placed in a generated PDF.
      questions_used: totals.questionsUsed,
      // TODO(spec 008 FR-007): storage quota (DB/S3) and PDF page counts are
      // not recorded anywhere yet — the ConsumptionMetric entity exists for
      // these monthly accumulators but nothing writes it. Until that pipeline
      // exists there is no source to derive them from; do not invent billing
      // semantics here.
      storage_mb: 0,
      pdf_pages_generated: 0,
    };
  }

  /**
   * Collects the cheaply derivable metrics of one tenant schema in a single
   * `runInSchema` transaction (one pooled connection per tenant, not one per
   * metric).
   *
   * The schema name reaches this class straight from a `tenant_id` query param,
   * and PostgreSQL cannot parameterize an identifier — interpolating it raw is a
   * SQL injection hole (`?tenant_id=x".users; DROP SCHEMA public CASCADE; --`).
   * Routing through `TenantService.runInSchema` forces the value through
   * `assertValidSchema` (a hard allowlist) before any SQL is built, which is the
   * only sanctioned way to name a schema in this codebase.
   *
   * The tables stay schema-qualified rather than relying on `search_path` alone:
   * `runInSchema` sets `search_path TO "<schema>", public`, so an unqualified
   * `users` would silently fall back to a public table if the tenant schema were
   * incomplete, reporting another tenant's data as this tenant's.
   */
  private async collectTenantMetrics(
    schema: string,
    range: { start?: Date; endExclusive?: Date },
  ): Promise<TenantMetrics> {
    return this.tenantService.runInSchema(schema, async (manager) => {
      const users = await manager.query(
        `SELECT COUNT(*) FROM "${schema}".users WHERE is_active = true`,
      );

      const conditions: string[] = [];
      const params: Date[] = [];
      if (range.start) {
        params.push(range.start);
        conditions.push(`used_at >= $${params.length}`);
      }
      if (range.endExclusive) {
        params.push(range.endExclusive);
        conditions.push(`used_at < $${params.length}`);
      }
      const where =
        conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
      const questions = await manager.query(
        `SELECT COUNT(*) FROM "${schema}".material_question_usage${where}`,
        params,
      );

      return {
        activeUsers: parseInt(users[0].count, 10),
        questionsUsed: parseInt(questions[0].count, 10),
      };
    });
  }

  // The range only filters questions_used (usage rows carry a timestamp);
  // active_users is a current-state count. An unparseable date is a caller
  // error, not something to silently ignore into an unfiltered total.
  private parseDateRange(
    startDate?: string,
    endDate?: string,
  ): { start?: Date; endExclusive?: Date } {
    const parse = (label: string, value?: string): Date | undefined => {
      if (!value) return undefined;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        throw new BadRequestException(`${label} is not a valid date: ${value}`);
      }
      return parsed;
    };

    const end = parse('end_date', endDate);

    return {
      start: parse('start_date', startDate),
      // end_date is inclusive of its ENTIRE final day. A date-only string
      // parses to midnight UTC, so filtering `used_at <= end` silently
      // dropped every row of the last day; the canonical fix is an exclusive
      // upper bound of end_date + 1 day (`used_at < end + 1d`).
      endExclusive:
        end === undefined
          ? undefined
          : new Date(end.getTime() + 24 * 60 * 60 * 1000),
    };
  }
}
