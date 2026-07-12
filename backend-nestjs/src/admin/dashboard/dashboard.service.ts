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
    // Basic implementation for MVP (aggregator of metrics could go here)
    // We mock the response to match the contract
    return {
      active_users: 150,
      storage_mb: 1024,
      pdf_pages_generated: 530,
      questions_used: 12000,
    };
  }
}
