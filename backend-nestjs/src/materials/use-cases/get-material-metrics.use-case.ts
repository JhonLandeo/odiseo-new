import { Injectable, Logger } from '@nestjs/common';
import { TenantService } from '../../database/tenant.service';
import { Material } from '../entities/material.entity';

@Injectable()
export class GetMaterialMetricsUseCase {
  private readonly logger = new Logger(GetMaterialMetricsUseCase.name);

  constructor(private readonly tenantService: TenantService) {}

  async getTenantDashboardMetrics(): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const generatedMaterials = await manager.count(Material);
      const activeCycles = await manager.query(
        `SELECT COUNT(DISTINCT cycle_id) FROM materials`,
      );
      const generatedPages = 0; // TBD logic

      return {
        materials_generated: generatedMaterials,
        active_cycles: parseInt(activeCycles[0].count, 10),
        pages_generated: generatedPages,
      };
    });
  }
}
