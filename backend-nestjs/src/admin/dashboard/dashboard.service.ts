import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumptionMetric } from './entities/consumption-metric.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ConsumptionMetric)
    private readonly metricRepository: Repository<ConsumptionMetric>,
    private readonly tenantService: TenantService,
  ) {}

  async getMetrics(tenantId: string, startDate?: string, endDate?: string) {
    let activeUsers = 0;

    if (tenantId === 'all') {
      const companies = await this.metricRepository.manager.query(
        `SELECT id FROM public.companies WHERE is_active = true`,
      );

      // Per-tenant tolerance is deliberate here: this is an aggregate across the
      // whole platform, so a single tenant whose schema is missing or mid-
      // migration must not blank out the number for every other tenant.
      const results = await Promise.all(
        companies.map(async (comp: { id: string }) => {
          try {
            return await this.countActiveUsers(`tenant_${comp.id}`);
          } catch (e) {
            this.logger.warn(
              `Schema tenant_${comp.id} not available for metrics: ${(e as Error).message}`,
            );
            return 0;
          }
        }),
      );
      activeUsers = results.reduce((sum, count) => sum + count, 0);
    } else {
      if (!tenantId) {
        throw new BadRequestException('tenant_id is required');
      }

      // No try/catch on purpose: for a single tenant, reporting `active_users: 0`
      // when the query actually failed is indistinguishable from a real zero and
      // hides outages. Let the failure surface as a 5xx.
      activeUsers = await this.countActiveUsers(`tenant_${tenantId}`);
    }

    return {
      active_users: activeUsers,
      storage_mb: 0,
      pdf_pages_generated: 0,
      questions_used: 0,
    };
  }

  /**
   * Counts active users inside a tenant schema.
   *
   * The schema name reaches this class straight from a `tenant_id` query param,
   * and PostgreSQL cannot parameterize an identifier — interpolating it raw is a
   * SQL injection hole (`?tenant_id=x".users; DROP SCHEMA public CASCADE; --`).
   * Routing through `TenantService.runInSchema` forces the value through
   * `assertValidSchema` (a hard allowlist) before any SQL is built, which is the
   * only sanctioned way to name a schema in this codebase.
   *
   * The table stays schema-qualified rather than relying on `search_path` alone:
   * `runInSchema` sets `search_path TO "<schema>", public`, so an unqualified
   * `users` would silently fall back to a public table if the tenant schema were
   * incomplete, reporting another tenant's data as this tenant's.
   */
  private async countActiveUsers(schema: string): Promise<number> {
    return this.tenantService.runInSchema(schema, async (manager) => {
      const res = await manager.query(
        `SELECT COUNT(*) FROM "${schema}".users WHERE is_active = true`,
      );
      return parseInt(res[0].count, 10);
    });
  }
}
