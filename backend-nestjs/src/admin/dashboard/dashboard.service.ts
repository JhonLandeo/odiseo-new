import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumptionMetric } from './entities/consumption-metric.entity';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ConsumptionMetric)
    private readonly metricRepository: Repository<ConsumptionMetric>,
  ) {}

  async getMetrics(tenantId: string, startDate?: string, endDate?: string) {
    let activeUsers = 0;

    try {
      if (tenantId === 'all') {
        const companies = await this.metricRepository.manager.query(
          `SELECT id FROM public.companies WHERE is_active = true`
        );

        const results = await Promise.all(
          companies.map(async (comp: any) => {
            try {
              const res = await this.metricRepository.manager.query(
                `SELECT COUNT(*) FROM "tenant_${comp.id}".users WHERE is_active = true`
              );
              return parseInt(res[0].count, 10);
            } catch (e) {
              this.logger.warn(`Schema tenant_${comp.id} not available for metrics: ${(e as Error).message}`);
              return 0;
            }
          })
        );
        activeUsers = results.reduce((sum, count) => sum + count, 0);
      } else {
        const res = await this.metricRepository.manager.query(
          `SELECT COUNT(*) FROM "tenant_${tenantId}".users WHERE is_active = true`
        );
        activeUsers = parseInt(res[0].count, 10);
      }
    } catch (e) {
      this.logger.error(`Error fetching dashboard metrics: ${(e as Error).message}`, (e as Error).stack);
    }

    return {
      active_users: activeUsers,
      storage_mb: 0,
      pdf_pages_generated: 0,
      questions_used: 0,
    };
  }
}
