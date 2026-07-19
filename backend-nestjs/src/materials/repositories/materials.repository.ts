import { Injectable } from '@nestjs/common';
import { IMaterialsRepository } from './i-materials.repository';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';
import { TenantService } from '../../database/tenant.service';

@Injectable()
export class MaterialsRepository implements IMaterialsRepository {
  constructor(private readonly tenantService: TenantService) {}

  async getUsedQuestionsInCycle(
    cycleId: string,
    courseId: string,
  ): Promise<string[]> {
    return this.tenantService.runInTenant(async (manager) => {
      const usageRepo = manager.getRepository(MaterialQuestionUsage);
      const usages = await usageRepo.find({
        where: { cycleId, courseId },
        select: ['questionId'],
      });
      return usages.map((u) => u.questionId);
    });
  }
}
