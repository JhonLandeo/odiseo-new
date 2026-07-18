import { Injectable, Logger } from '@nestjs/common';
import { TenantService } from '../../database/tenant.service';
import { Material } from '../entities/material.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';

@Injectable()
export class GetMaterialHistoryUseCase {
  private readonly logger = new Logger(GetMaterialHistoryUseCase.name);

  constructor(private readonly tenantService: TenantService) {}

  async getHistory(
    cycleIds?: string[],
    weekNumbers?: number[],
    templateIds?: string[],
  ): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const query = manager
        .createQueryBuilder(Material, 'material')
        .leftJoinAndMapOne(
          'material.latestRequest',
          MaterialRequest,
          'latestRequest',
          'latestRequest.id = material.latest_request_id',
        )
        .leftJoinAndSelect('latestRequest.courses', 'courses')
        .innerJoin(
          CycleMaterialTemplate,
          'template',
          'template.id = material.profile_id',
        )
        .innerJoinAndMapOne(
          'material.cycle',
          Cycle,
          'cycle',
          'cycle.id = material.cycle_id',
        )
        .orderBy('material.updated_at', 'DESC');

      if (cycleIds && cycleIds.length > 0) {
        query.andWhere('material.cycle_id IN (:...cycleIds)', { cycleIds });
      }

      if (weekNumbers && weekNumbers.length > 0) {
        query.andWhere('material.week_number IN (:...weekNumbers)', {
          weekNumbers,
        });
      }

      if (templateIds && templateIds.length > 0) {
        query.andWhere('material.profile_id IN (:...templateIds)', {
          templateIds,
        });
      }

      const materials = await query.getMany();
      return materials.map((m) => ({
        id: m.latestRequestId || m.id,
        materialId: m.id,
        tenantId: m.tenantId,
        profileId: m.profileId,
        cycleId: m.cycleId,
        weekNumber: m.weekNumber,
        status: m.status,
        latestRequestId: m.latestRequestId,
        createdAt: m.latestRequest?.createdAt || m.createdAt,
        updatedAt: m.updatedAt,
        cycle: m.cycle,
        courses: m.latestRequest?.courses || [],
      }));
    });
  }

  async getAttempts(materialId: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const attempts = await manager.find(MaterialRequest, {
        where: { materialId },
        relations: ['courses'],
        order: { version: 'DESC', createdAt: 'DESC' },
      });

      return attempts.map((attempt) => ({
        id: attempt.id,
        version: attempt.version,
        status: attempt.status,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
        mergedDownloadUrl: attempt.mergedDownloadUrl,
        mergedKeyDownloadUrl: attempt.mergedKeyDownloadUrl,
        mergedSolutionDownloadUrl: attempt.mergedSolutionDownloadUrl,
        courses: attempt.courses,
      }));
    });
  }
}
