import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantService } from '../../database/tenant.service';
import { SyllabusDistribution } from '../entities/syllabus-distribution.entity';
import { Syllabus } from '../entities/syllabus.entity';

@Injectable()
export class MaterialGeneratedListener {
  private readonly logger = new Logger(MaterialGeneratedListener.name);

  constructor(private readonly tenantService: TenantService) {}

  private static readonly MAX_ATTEMPTS = 3;

  @OnEvent('material.course.generated', { async: true })
  async handleMaterialGeneratedEvent(event: {
    cycleId: string;
    courseId: string;
    weekNumber: number;
  }) {
    this.logger.log(
      `Received material.course.generated for cycle ${event.cycleId}, course ${event.courseId}, week ${event.weekNumber}`,
    );

    // Bounded retry: this update is fire-and-forget, so a transient DB failure
    // would otherwise silently leave the week marked as not-generated. Retry a
    // few times with backoff before giving up.
    // NOTE: a durable dead-letter queue is the production-grade version of this.
    for (
      let attempt = 1;
      attempt <= MaterialGeneratedListener.MAX_ATTEMPTS;
      attempt++
    ) {
      try {
        await this.markWeekGenerated(event);
        this.logger.log(
          `Successfully updated syllabus distribution for week ${event.weekNumber}`,
        );
        return;
      } catch (error) {
        const isLast = attempt === MaterialGeneratedListener.MAX_ATTEMPTS;
        this.logger.error(
          `Failed to update syllabus generated status (attempt ${attempt}/${MaterialGeneratedListener.MAX_ATTEMPTS})`,
          error as Error,
        );
        if (isLast) {
          return;
        }
        await this.delay(attempt * 500);
      }
    }
  }

  private async markWeekGenerated(event: {
    cycleId: string;
    courseId: string;
    weekNumber: number;
  }) {
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
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
