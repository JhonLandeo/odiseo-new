import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantService } from '../../database/tenant.service';
import { WebhookStatusRequestDto } from '../dto/webhook-status-request.dto';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { Material } from '../entities/material.entity';
import { ClsService } from 'nestjs-cls';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class HandleMaterialWebhookUseCase {
  private readonly logger = new Logger(HandleMaterialWebhookUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly cls: ClsService,
    @InjectQueue('materials-queue') private readonly materialsQueue: Queue,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async execute(statusData: WebhookStatusRequestDto): Promise<void> {
    if (!statusData.job_id || !statusData.status) {
      throw new BadRequestException('job_id and status are required');
    }
    this.logger.log(
      `Received internal webhook update for job ${statusData.job_id}: ${statusData.status}`,
    );

    await this.tenantService.runInTenant(async (manager) => {
      // Find course request by ID
      const courseReq = await manager.findOne(MaterialRequestCourse, {
        where: { id: statusData.job_id },
      });
      if (!courseReq) {
        this.logger.warn(
          `No MaterialRequestCourse found for job_id: ${statusData.job_id}`,
        );
        return;
      }

      let courseStatus: CourseMaterialStatus = CourseMaterialStatus.FAILED;
      if (statusData.status === 'completed') {
        courseStatus = CourseMaterialStatus.COMPLETED;
      } else if (statusData.status === 'completed_with_warnings') {
        courseStatus = CourseMaterialStatus.COMPLETED_WITH_WARNINGS;
      } else if (statusData.status === 'empty_bank') {
        courseStatus = CourseMaterialStatus.EMPTY_BANK;
      } else if (statusData.status === 'failed') {
        courseStatus = CourseMaterialStatus.FAILED;
      } else if (statusData.status === 'processing') {
        courseStatus = CourseMaterialStatus.PROCESSING;
      }

      // Update course request
      await manager.update(MaterialRequestCourse, courseReq.id, {
        status: courseStatus,
        downloadUrl: statusData.download_url || undefined,
        keyDownloadUrl: statusData.key_download_url || undefined,
        solutionDownloadUrl: statusData.solution_download_url || undefined,
        warnings: (statusData.error_message
          ? { error: statusData.error_message }
          : null) as any,
      });

      this.logger.log(
        `MaterialRequestCourse ${courseReq.id} updated to ${courseStatus}`,
      );

      const requestParent = await manager.findOne(MaterialRequest, {
        where: { id: courseReq.materialRequestId },
      });

      if (
        requestParent &&
        (courseStatus === CourseMaterialStatus.COMPLETED ||
          courseStatus === CourseMaterialStatus.COMPLETED_WITH_WARNINGS)
      ) {
        this.eventEmitter.emit('material.course.generated', {
          cycleId: requestParent.cycleId,
          courseId: courseReq.courseId,
          weekNumber: requestParent.weekNumber,
        });
      }

      // Check if all courses in the parent MaterialRequest are complete
      const siblingCourses = await manager.find(MaterialRequestCourse, {
        where: { materialRequestId: courseReq.materialRequestId },
      });

      const allFinished = siblingCourses.every(
        (c) =>
          c.status === CourseMaterialStatus.COMPLETED ||
          c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS ||
          c.status === CourseMaterialStatus.EMPTY_BANK ||
          c.status === CourseMaterialStatus.FAILED,
      );

      if (allFinished) {
        const hasFailed = siblingCourses.some(
          (c) => c.status === CourseMaterialStatus.FAILED,
        );
        const hasWarnings = siblingCourses.some(
          (c) =>
            c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS ||
            c.status === CourseMaterialStatus.EMPTY_BANK,
        );

        let finalStatus = MaterialRequestStatus.COMPLETED;
        if (hasFailed) {
          finalStatus = MaterialRequestStatus.FAILED;
        } else if (hasWarnings) {
          finalStatus = MaterialRequestStatus.REVIEW_REQUIRED;
        }

        await manager.update(MaterialRequest, courseReq.materialRequestId, {
          status: finalStatus,
        });
        this.logger.log(
          `Parent MaterialRequest ${courseReq.materialRequestId} final status: ${finalStatus}`,
        );

        // Update logical Material parent status
        const request = await manager.findOne(MaterialRequest, {
          where: { id: courseReq.materialRequestId },
        });
        if (request && request.materialId) {
          await manager.update(Material, request.materialId, {
            status: finalStatus,
          });
          this.logger.log(
            `Parent Material ${request.materialId} status updated to ${finalStatus}`,
          );
        }

        // Dispatch merge job if all courses completed
        if (!hasFailed && siblingCourses.length >= 2) {
          const request = await manager.findOne(MaterialRequest, {
            where: { id: courseReq.materialRequestId },
          });
          if (request) {
            const tenantId = this.cls.get('companyId');
            if (!tenantId) {
              this.logger.warn(
                'Cannot dispatch merge job: tenant not identified',
              );
              return;
            }
            await this.materialsQueue.add('merge-pdf', {
              material_request_id: courseReq.materialRequestId,
              tenant_id: tenantId,
            });
            this.logger.log(
              `Merge job dispatched for MaterialRequest ${courseReq.materialRequestId}`,
            );
          }
        }
      }
    });
  }
}
