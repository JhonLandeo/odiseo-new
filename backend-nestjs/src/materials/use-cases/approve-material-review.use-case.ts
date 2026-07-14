import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Between } from 'typeorm';
import { TenantService } from '../../database/tenant.service';
import { ApproveReviewDto } from '../dto/approve-review.dto';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { MaterialReviewQuestion, ReviewQuestionStatus } from '../entities/material-review-question.entity';
import { Material } from '../entities/material.entity';
import { MaterialRequestCourse, CourseMaterialStatus } from '../entities/material-request-course.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';

@Injectable()
export class ApproveMaterialReviewUseCase {
  private readonly logger = new Logger(ApproveMaterialReviewUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    @InjectQueue('materials-queue') private readonly materialsQueue: Queue,
  ) {}

  async saveDraft(id: string, dto: ApproveReviewDto, tenantId: string): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      if (request.version !== dto.version) {
        throw new ConflictException(
          'El material ya está siendo revisado por otro administrador o su estado ha cambiado',
        );
      }

      for (const replacement of dto.replacements) {
        await manager.update(
          MaterialReviewQuestion,
          { id: replacement.reviewQuestionId, materialRequestId: id },
          {
            questionId: replacement.questionId,
            status: ReviewQuestionStatus.REPLACED,
          },
        );
      }

      for (const removalId of dto.removals) {
        await manager.update(
          MaterialReviewQuestion,
          { id: removalId, materialRequestId: id },
          {
            status: ReviewQuestionStatus.REMOVED,
          },
        );
      }
      
      return { status: 'OK', message: 'Borrador guardado exitosamente' };
    });
  }

  async execute(id: string, dto: ApproveReviewDto, tenantId: string, userId: string): Promise<any> {
    const jobsToDispatch: { name: string, data: any }[] = [];

    const result = await this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
        relations: ['courses'],
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      if (request.version !== dto.version) {
        throw new ConflictException(
          'El material ya está siendo revisado por otro administrador o su estado ha cambiado',
        );
      }

      for (const replacement of dto.replacements) {
        await manager.update(
          MaterialReviewQuestion,
          { id: replacement.reviewQuestionId, materialRequestId: id },
          {
            questionId: replacement.questionId,
            status: ReviewQuestionStatus.REPLACED,
          },
        );
      }

      for (const removalId of dto.removals) {
        await manager.update(
          MaterialReviewQuestion,
          { id: removalId, materialRequestId: id },
          {
            status: ReviewQuestionStatus.REMOVED,
          },
        );
      }

      const updatedQuestions = await manager.find(MaterialReviewQuestion, {
        where: { materialRequestId: id },
      });
      const hasEmpty = updatedQuestions.some(
        (q) => q.status === ReviewQuestionStatus.EMPTY,
      );

      if (hasEmpty && !dto.continueWithWarnings) {
        throw new BadRequestException('Existen slots vacíos no resueltos');
      }

      const alreadyGenerated = request.courses.every(
        (c) =>
          c.downloadUrl != null &&
          c.keyDownloadUrl != null &&
          c.solutionDownloadUrl != null,
      );
      const noChanges = dto.replacements.length === 0 && dto.removals.length === 0;

      if (alreadyGenerated && noChanges) {
        const finalStatus = hasEmpty ? MaterialRequestStatus.COMPLETED_WITH_WARNINGS : MaterialRequestStatus.COMPLETED;
        request.status = finalStatus;
        await manager.save(request);

        if (request.materialId) {
          await manager.update(Material, request.materialId, { status: finalStatus });
        }
        
        for (const courseReq of request.courses) {
          const courseStatus = courseReq.warnings ? CourseMaterialStatus.COMPLETED_WITH_WARNINGS : CourseMaterialStatus.COMPLETED;
          await manager.update(MaterialRequestCourse, courseReq.id, { status: courseStatus });
        }

        this.logger.log(`Curation approved for MaterialRequest ${id} without changes. Bypassing regeneration.`);
        return {
          status: finalStatus,
          message: 'Revisión aprobada sin cambios. El documento existente se mantiene.',
        };
      }

      request.status = MaterialRequestStatus.PROCESSING;
      await manager.save(request);

      if (request.materialId) {
        await manager.update(Material, request.materialId, {
          status: MaterialRequestStatus.PROCESSING,
        });
      }

      const company = await manager.findOne(Company, { where: { id: tenantId } });

      for (const courseReq of request.courses) {
        await manager.update(MaterialRequestCourse, courseReq.id, {
          status: CourseMaterialStatus.PROCESSING,
        });

        const syllabus = await manager.findOne(Syllabus, {
          where: {
            courseId: courseReq.courseId,
            cycleId: request.cycleId,
            isActive: true,
          },
        });

        let distributions: SyllabusDistribution[] = [];
        const template = await manager.findOne(CycleMaterialTemplate, {
          where: { id: request.profileId },
        });
        
        if (template && syllabus) {
          if (template.scope === 'CURRENT_WEEK') {
            distributions = await manager.find(SyllabusDistribution, {
              where: { syllabusId: syllabus.id, weekNumber: request.weekNumber },
            });
          } else if (template.scope === 'ACCUMULATIVE') {
            const startWeek = template.accumulationWeeks
              ? Math.max(1, request.weekNumber - template.accumulationWeeks + 1)
              : 1;
            distributions = await manager.find(SyllabusDistribution, {
              where: {
                syllabusId: syllabus.id,
                weekNumber: Between(startWeek, request.weekNumber),
              },
            });
          }
        }

        const syllabusPayload = distributions.map((dist) => ({
          topic_id: dist.topicId,
          subtopic_id: dist.subtopicId,
          quantity: dist.questionCount,
        }));

        const job = {
          job_id: courseReq.id,
          material_request_id: request.id,
          tenant_id: tenantId,
          cycle_id: request.cycleId,
          week_number: request.weekNumber,
          template_name: template?.name || 'Material',
          design_template_id: request.designTemplateId,
          tenant: {
            tenant_id: tenantId,
            commercial_name: company?.commercialName || 'Colegio Odiseo Innova',
            logo_url: company?.logoUrl || 'https://s3.aws.com/tenant-assets/odiseo-innova.png',
          },
          material_type: 'BALOTARIO',
          course_id: courseReq.courseId,
          difficulty_level: 'MEDIA',
          syllabus_distribution: syllabusPayload,
          notification: { admin_user_id: userId },
        };

        jobsToDispatch.push({ name: 'generate', data: job });
      }

      return {
        status: MaterialRequestStatus.PROCESSING,
        message: 'Generación de PDFs iniciada',
      };
    });

    for (const job of jobsToDispatch) {
      await this.materialsQueue.add(job.name, job.data);
    }
    
    if (jobsToDispatch.length > 0) {
      this.logger.log(`Curation approved for MaterialRequest ${id}. Dispatched jobs to BullMQ.`);
    }

    return result;
  }
}
