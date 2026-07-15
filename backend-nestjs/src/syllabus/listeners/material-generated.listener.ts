import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantService } from '../../database/tenant.service';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
import { Syllabus } from '../entities/syllabus.entity';

@Injectable()
export class MaterialGeneratedListener {
  private readonly logger = new Logger(MaterialGeneratedListener.name);

  constructor(private readonly tenantService: TenantService) {}

  @OnEvent('material.course.generated', { async: true })
  async handleMaterialGeneratedEvent(event: {
    cycleId: string;
    courseId: string;
    weekNumber: number;
  }) {
    this.logger.log(
      `Received material.course.generated for cycle ${event.cycleId}, course ${event.courseId}, week ${event.weekNumber}`,
    );

    try {
      await this.tenantService.runInTenant(async (manager) => {
        const syllabus = await manager.findOne(Syllabus, {
          where: { cycleId: event.cycleId, courseId: event.courseId },
        });

        if (!syllabus) {
          return;
        }

        await manager.update(
          SyllabusDistribution,
          { syllabusId: syllabus.id, weekNumber: event.weekNumber },
          { isGenerated: true },
        );
      });
      this.logger.log(`Successfully updated syllabus distribution for week ${event.weekNumber}`);
    } catch (error) {
      this.logger.error('Failed to update syllabus generated status:', error);
    }
  }
}
