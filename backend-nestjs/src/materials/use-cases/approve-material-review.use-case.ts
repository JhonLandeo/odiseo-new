import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Between, In } from 'typeorm';
import { TenantService } from '../../database/tenant.service';
import { ApproveReviewDto } from '../dto/approve-review.dto';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from '../entities/material-review-question.entity';
import { Material } from '../entities/material.entity';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { MATERIALS_JOB_OPTIONS } from '../constants/materials-queue.constants';

/**
 * Actor and tenancy context for a curation approval.
 *
 * This is a single named object rather than two adjacent `string` parameters
 * on purpose: `execute(id, dto, tenantId, userId)` was being called as
 * `execute(id, dto, userId, tenantId)` and TypeScript could not see it, because
 * both positions have the same type. Every curated PDF was therefore branded
 * with the fallback school name and logo (the company lookup keyed on a user
 * uuid always returned null), the dispatched job carried a user uuid as its
 * `tenant_id`, and the notification was addressed to a company uuid. Named
 * fields make that whole class of mistake a compile error.
 */
export interface MaterialReviewContext {
  tenantId: string;
  userId: string;
}

@Injectable()
export class ApproveMaterialReviewUseCase {
  private readonly logger = new Logger(ApproveMaterialReviewUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    @InjectQueue('materials-queue') private readonly materialsQueue: Queue,
  ) {}

  /**
   * Takes the same named context object as `execute` so both entry points of
   * this use case share one shape. The previous signature declared a third
   * `tenantId` parameter that the controller filled with a user uuid and that
   * the body never read — dead weight that also modelled the argument order
   * wrongly for anyone reading the two methods side by side.
   */
  async saveDraft(
    id: string,
    dto: ApproveReviewDto,
    ctx: MaterialReviewContext,
  ): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      // Atomic optimistic guard: bump the version only if it still matches the
      // client's last-known value. A concurrent draft that already bumped it
      // gets affected=0 here and loses — so two admins can no longer overwrite
      // each other's curation silently (the previous read-only check did not
      // bump the version, leaving concurrent drafts unprotected).
      const bump = await manager.update(
        MaterialRequest,
        { id, version: dto.version },
        { version: () => '"version" + 1' },
      );
      if (bump.affected === 0) {
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

      this.logger.log(
        `Draft curation saved for MaterialRequest ${id} by user ${ctx.userId}`,
      );

      return { status: 'OK', message: 'Borrador guardado exitosamente' };
    });
  }

  async execute(
    id: string,
    dto: ApproveReviewDto,
    ctx: MaterialReviewContext,
  ): Promise<any> {
    const { tenantId, userId } = ctx;
    const jobsToDispatch: { name: string; data: any }[] = [];

    const result = await this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
        relations: ['courses'],
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      // Atomic optimistic guard, same as `saveDraft`. The previous read-then-
      // compare left a TOCTOU window: two admins could both read version=3,
      // both pass the comparison, and both enqueue a full PDF generation for
      // the same request. Making the database decide the winner via a
      // conditional UPDATE closes it — the loser gets affected=0.
      const bump = await manager.update(
        MaterialRequest,
        { id, version: dto.version },
        { version: () => '"version" + 1' },
      );
      if (bump.affected === 0) {
        throw new ConflictException(
          'El material ya está siendo revisado por otro administrador o su estado ha cambiado',
        );
      }
      // Keep the in-memory entity in step with the row we just bumped. The
      // later `manager.save(request)` calls issue an optimistic-lock UPDATE
      // keyed on @VersionColumn, and a stale value here would make them fail.
      request.version = dto.version + 1;

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
      const noChanges =
        dto.replacements.length === 0 && dto.removals.length === 0;

      if (alreadyGenerated && noChanges) {
        const finalStatus = hasEmpty
          ? MaterialRequestStatus.COMPLETED_WITH_WARNINGS
          : MaterialRequestStatus.COMPLETED;
        request.status = finalStatus;
        await manager.save(request);

        if (request.materialId) {
          await manager.update(Material, request.materialId, {
            status: finalStatus,
          });
        }

        const coursesWithWarnings = request.courses
          .filter((c) => c.warnings)
          .map((c) => c.id);
        const coursesWithoutWarnings = request.courses
          .filter((c) => !c.warnings)
          .map((c) => c.id);

        if (coursesWithWarnings.length > 0) {
          await manager.update(
            MaterialRequestCourse,
            { id: In(coursesWithWarnings) },
            { status: CourseMaterialStatus.COMPLETED_WITH_WARNINGS },
          );
        }
        if (coursesWithoutWarnings.length > 0) {
          await manager.update(
            MaterialRequestCourse,
            { id: In(coursesWithoutWarnings) },
            { status: CourseMaterialStatus.COMPLETED },
          );
        }

        this.logger.log(
          `Curation approved for MaterialRequest ${id} without changes. Bypassing regeneration.`,
        );
        return {
          status: finalStatus,
          message:
            'Revisión aprobada sin cambios. El documento existente se mantiene.',
        };
      }

      request.status = MaterialRequestStatus.PROCESSING;
      await manager.save(request);

      if (request.materialId) {
        await manager.update(Material, request.materialId, {
          status: MaterialRequestStatus.PROCESSING,
        });
      }

      const company = await manager.findOne(Company, {
        where: { id: tenantId },
      });
      const template = await manager.findOne(CycleMaterialTemplate, {
        where: { id: request.profileId },
      });

      const allCourseReqIds = request.courses.map((c) => c.id);
      if (allCourseReqIds.length > 0) {
        await manager.update(
          MaterialRequestCourse,
          { id: In(allCourseReqIds) },
          {
            status: CourseMaterialStatus.PROCESSING,
          },
        );
      }

      for (const courseReq of request.courses) {
        const syllabus = await manager.findOne(Syllabus, {
          where: {
            courseId: courseReq.courseId,
            cycleId: request.cycleId,
            isActive: true,
          },
        });

        let distributions: SyllabusDistribution[] = [];

        if (template && syllabus) {
          if (template.scope === 'CURRENT_WEEK') {
            distributions = await manager.find(SyllabusDistribution, {
              where: {
                syllabusId: syllabus.id,
                weekNumber: request.weekNumber,
              },
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
            logo_url:
              company?.logoUrl ||
              'https://s3.aws.com/tenant-assets/odiseo-innova.png',
          },
          // Read the type the request was actually created with, rather than
          // hardcoding 'BALOTARIO' — that would silently downgrade any
          // 'PRACTICA' request that goes through the review flow.
          material_type: request.materialType || 'BALOTARIO',
          course_id: courseReq.courseId,
          // KNOWN GAP: there is no per-request difficulty in the domain model.
          // `CycleMaterialTemplateCourse` stores easy/medium/hard *counts*, not
          // a single level, and no consumer reads this field today (it exists
          // only on the job DTOs). Left as a constant until a real source is
          // modelled — do not mistake it for configured data.
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
      await this.materialsQueue.add(job.name, job.data, MATERIALS_JOB_OPTIONS);
    }

    if (jobsToDispatch.length > 0) {
      this.logger.log(
        `Curation approved for MaterialRequest ${id}. Dispatched jobs to BullMQ.`,
      );
    }

    return result;
  }
}
