import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsumptionMetric } from './entities/consumption-metric.entity';

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(ConsumptionMetric)
    private readonly metricRepository: Repository<ConsumptionMetric>,
  ) {}

  async getMetrics(tenantId: string, startDate?: string, endDate?: string) {
    let activeUsers = 0;

    try {
      if (tenantId === 'all') {
        const companies = await this.metricRepository.manager.query(`SELECT id FROM public.companies WHERE is_active = true`);
        for (const comp of companies) {
          try {
            const res = await this.metricRepository.manager.query(`SELECT COUNT(*) FROM "tenant_${comp.id}".users WHERE is_active = true`);
            activeUsers += parseInt(res[0].count, 10);
          } catch(e) {} // Ignore schemas that don't exist yet
        }
      } else {
        const res = await this.metricRepository.manager.query(`SELECT COUNT(*) FROM "tenant_${tenantId}".users WHERE is_active = true`);
        activeUsers = parseInt(res[0].count, 10);
      }
    } catch(e) {}

    return {
      active_users: activeUsers,
      storage_mb: 0,
      pdf_pages_generated: 0,
      questions_used: 0,
    };
  }
}
