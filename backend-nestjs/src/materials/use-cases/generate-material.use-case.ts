import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { Between, In } from 'typeorm';
import {
  I_MATERIALS_REPOSITORY,
  type IMaterialsRepository,
} from '../repositories/i-materials.repository';
import { GenerateMaterialDto } from '../dto/generate-material.dto';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { CourseMaterialStatus } from '../entities/material-request-course.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { PdfDesignTemplate } from '../entities/pdf-design-template.entity';
import { TenantService } from '../../database/tenant.service';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';
import { Company } from '../../tenants/entities/tenant.entity';
import { MaterialRequestCourse } from '../entities/material-request-course.entity';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from '../entities/material-review-question.entity';
import { QuestionBankService } from '../../question-bank/question-bank.service';
import { Question } from '../../question-bank/entities/question.entity';
import { getLevelIdsForDifficulty } from '../../question-bank/constants/question-levels.constant';
import {
  QuestionSelectionStrategy,
  SelectionRequest,
} from '../../question-bank/strategies/question-selection.strategy';

import { Material } from '../entities/material.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';
import { MATERIALS_JOB_OPTIONS } from '../constants/materials-queue.constants';

@Injectable()
export class GenerateMaterialUseCase {
  constructor(
    @Inject(I_MATERIALS_REPOSITORY)
    private readonly materialsRepo: IMaterialsRepository,
    @InjectQueue('materials-queue')
    private readonly materialsQueue: Queue,
    private readonly tenantService: TenantService,
    private readonly questionBankService: QuestionBankService,
  ) {}

  async execute(
    tenantId: string,
    userId: string,
    dto: GenerateMaterialDto,
  ): Promise<any> {
    // Jobs are collected here and dispatched only after `runInTenant` resolves
    // (the same shape ApproveMaterialReviewUseCase uses). Enqueuing inside the
    // transaction let a worker dequeue and query for a MaterialRequest row that
    // was not committed yet, and a rollback left an orphan job pointing at a
    // request that never existed.
    const jobsToDispatch: { name: string; data: any }[] = [];

    const result = await this.tenantService.runInTenant(async (manager) => {
      // 1. Fetch template info for naming
      const template = await manager.findOne(CycleMaterialTemplate, {
        where: { id: dto.profile_id },
        relations: ['courses'],
      });
      if (!template) {
        throw new BadRequestException('El perfil seleccionado no existe');
      }
      const templateName = template?.name || 'Material';
      const cycleId = template?.cycleId || uuidv4();

      // Fetch company branding
      const company = await manager.findOne(Company, {
        where: { id: tenantId },
      });

      const realDistributions: any[] = [];
      const coursesResponseList: { courseId: string; status: string }[] = [];

      for (const course of dto.courses || template?.courses || []) {
        const courseId = course.course_id || (course as any).courseId;
        const syllabus = await manager.findOne(Syllabus, {
          where: { courseId, cycleId, isActive: true },
        });
        if (!syllabus) {
          continue;
        }

        let distributions: SyllabusDistribution[] = [];
        if (template.scope === 'CURRENT_WEEK') {
          distributions = await manager.find(SyllabusDistribution, {
            where: { syllabusId: syllabus.id, weekNumber: dto.week_number },
          });
        } else if (template.scope === 'ACCUMULATIVE') {
          const startWeek = template.accumulationWeeks
            ? Math.max(1, dto.week_number - template.accumulationWeeks + 1)
            : 1;
          distributions = await manager.find(SyllabusDistribution, {
            where: {
              syllabusId: syllabus.id,
              weekNumber: Between(startWeek, dto.week_number),
            },
          });
        }

        if (distributions.length === 0) {
          continue;
        }

        const templateCourse = template?.courses?.find(
          (tc) =>
            tc.courseId === courseId || (tc as any).course_id === courseId,
        );
        const targetQuantity = templateCourse?.questionsQuantity || 35;

        const easyCount =
          templateCourse?.easyCount || Math.floor(targetQuantity * 0.4);
        const mediumCount =
          templateCourse?.mediumCount || Math.floor(targetQuantity * 0.4);
        let hardCount =
          templateCourse?.hardCount || Math.floor(targetQuantity * 0.2);

        // Ensure the sum matches targetQuantity
        const currentSum = easyCount + mediumCount + hardCount;
        if (currentSum !== targetQuantity) {
          hardCount += targetQuantity - currentSum;
        }

        const levelsPool: string[] = [
          ...Array(easyCount).fill('EASY'),
          ...Array(mediumCount).fill('MEDIUM'),
          ...Array(hardCount).fill('HARD'),
        ];
        // Shuffle the levels pool (unbiased Fisher-Yates) to distribute
        // difficulties randomly across subtopics. `sort(() => 0.5 - random)` is
        // a biased shuffle and must not be used.
        for (let i = levelsPool.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [levelsPool[i], levelsPool[j]] = [levelsPool[j], levelsPool[i]];
        }

        const topics = distributions
          .map((dist, idx) => {
            const baseQty = Math.floor(targetQuantity / distributions.length);
            const remainder = targetQuantity % distributions.length;
            const quantity = idx < remainder ? baseQty + 1 : baseQty;

            const expectedLevels = levelsPool.splice(0, quantity);

            return {
              topic_id: dist.topicId,
              subtopic_id: dist.subtopicId,
              quantity,
              expected_levels: expectedLevels,
            };
          })
          .filter((t) => t.quantity > 0);

        const exclude_question_ids =
          await this.materialsRepo.getUsedQuestionsInCycle(cycleId, courseId);

        realDistributions.push({
          course_id: courseId,
          topics,
          exclude_question_ids,
        });

        coursesResponseList.push({
          courseId,
          status: 'PENDING',
        });
      }

      if (realDistributions.length === 0) {
        throw new BadRequestException(
          'No hay distribución de sílabo configurada para la semana seleccionada en los cursos del perfil',
        );
      }

      const initialStatus = dto.requires_review
        ? MaterialRequestStatus.REVIEW_REQUIRED
        : MaterialRequestStatus.PROCESSING;

      // 4. Resolver plantilla de diseño por defecto si no se especificó una
      let designTemplateId = dto.design_template_id || null;
      if (!designTemplateId) {
        const defaultDesign = await manager.findOne(PdfDesignTemplate, {
          where: { tenantId, isDefault: true },
        });
        if (defaultDesign) {
          designTemplateId = defaultDesign.id;
        }
      }

      // 5. Buscar o crear la entidad principal Material
      let material = await manager.findOne(Material, {
        where: {
          tenantId,
          profileId: dto.profile_id,
          weekNumber: dto.week_number,
        },
      });

      if (!material) {
        material = manager.create(Material, {
          id: uuidv4(),
          tenantId,
          profileId: dto.profile_id,
          cycleId,
          weekNumber: dto.week_number,
          status: initialStatus,
          latestRequestId: null,
        });
        await manager.save(Material, material);
      } else {
        // Clear previous usages of this material to free up questions when regenerating
        const prevRequests = await manager.find(MaterialRequest, {
          where: { materialId: material.id },
        });
        const prevRequestIds = prevRequests.map((r) => r.id);
        if (prevRequestIds.length > 0) {
          await manager.delete(MaterialQuestionUsage, {
            materialRequestId: In(prevRequestIds),
          });
        }

        material.status = initialStatus;
        await manager.save(Material, material);
      }

      // Crear el registro de intento (materialRequest) en base de datos
      const materialRequest = manager.create(MaterialRequest, {
        tenantId,
        profileId: dto.profile_id,
        cycleId,
        weekNumber: dto.week_number,
        requiresReview: dto.requires_review,
        materialType: dto.exam_areas ? 'EXAMEN' : 'BALOTARIO',
        designTemplateId,
        createdBy: userId,
        status: initialStatus,
        materialId: material.id,
      });
      await manager.save(MaterialRequest, materialRequest);

      // Actualizar el material padre para apuntar a esta última solicitud
      material.latestRequestId = materialRequest.id;
      await manager.save(Material, material);

      const coursesToCreate = realDistributions.map((c: any) => ({
        materialRequestId: materialRequest.id,
        courseId: c.course_id,
        status: CourseMaterialStatus.PENDING,
      }));
      const createdCourses = await Promise.all(
        coursesToCreate.map(async (c) => {
          const course = manager.create(MaterialRequestCourse, c);
          return manager.save(MaterialRequestCourse, course);
        }),
      );

      for (const dist of realDistributions) {
        const dbCourse = createdCourses.find(
          (c) => c.courseId === dist.course_id,
        );
        if (dbCourse) {
          dist.course_request_id = dbCourse.id;
        }
      }

      // Always generate question slots to allow auditing and review (T023)
      let position = 1;
      const reviewQuestionsToSave: MaterialReviewQuestion[] = [];

      // 1. Gather all subtopic UUIDs and convert them to numeric IDs
      const allSubtopicIds = realDistributions.flatMap((dist) =>
        dist.topics.map((t: any) => t.subtopic_id),
      );
      const uniqueSubtopicIds = Array.from(new Set(allSubtopicIds));
      const numericSubtopicIds = uniqueSubtopicIds.map(Number);

      if (numericSubtopicIds.length > 0) {
        // 2. Fetch the question mapping using QuestionBankService
        const mappings =
          await this.questionBankService.getSubtopicQuestionMappings(
            numericSubtopicIds,
          );

        // Group question IDs by numeric subtopic ID
        const questionsByNumericSubtopic = new Map<number, string[]>();
        const allQuestionIds = new Set<string>();
        for (const m of mappings) {
          const subId = Number(m.subtopicId);
          const qId = String(m.questionId);
          if (!questionsByNumericSubtopic.has(subId)) {
            questionsByNumericSubtopic.set(subId, []);
          }
          questionsByNumericSubtopic.get(subId)!.push(qId);
          allQuestionIds.add(qId);
        }

        // 3. Load all questions and their alternatives in a single query
        let questionMap = new Map<string, Question>();
        if (allQuestionIds.size > 0) {
          const dbQuestions = await this.questionBankService.getQuestionsByIds(
            Array.from(allQuestionIds),
          );
          questionMap = new Map(dbQuestions.map((q) => [q.id, q]));
        }

        // 4. Construct review questions for all courses/topics
        for (const dist of realDistributions) {
          for (const t of dist.topics) {
            const numericSubtopicId = Number(t.subtopic_id);
            const subtopicQuestionIds =
              questionsByNumericSubtopic.get(numericSubtopicId) || [];

            const subtopicQuestions = subtopicQuestionIds
              .map((id) => questionMap.get(id))
              .filter(
                (q): q is Question =>
                  !!q && !dist.exclude_question_ids.includes(q.id),
              );

            const availablePool = subtopicQuestions;

            const requests: SelectionRequest[] = [];
            for (let i = 0; i < t.quantity; i++) {
              requests.push({ expectedLevel: t.expected_levels[i] });
            }

            // Use strategy. GenerateMaterialUseCase does NOT recycle used questions (allowRecycling: false)
            const selectedQuestions =
              QuestionSelectionStrategy.selectBestQuestions(
                availablePool,
                [], // exclude_question_ids were already filtered out of subtopicQuestions earlier
                requests,
                false,
              );

            for (let i = 0; i < t.quantity; i++) {
              const expectedLevelStr = t.expected_levels[i];
              const dbQ = selectedQuestions[i];

              const isVacant = !dbQ;
              const reviewQ = manager.create(MaterialReviewQuestion, {
                id: uuidv4(),
                materialRequestId: materialRequest.id,
                questionId: isVacant ? undefined : dbQ.id,
                topicId: t.topic_id,
                subtopicId: t.subtopic_id,
                expectedLevel: expectedLevelStr,
                position: position++,
                status: isVacant
                  ? ReviewQuestionStatus.EMPTY
                  : ReviewQuestionStatus.FOUND,
              } as any);
              reviewQuestionsToSave.push(reviewQ);
            }
          }
        }
      }

      // 5. Bulk save all review questions in a single query
      if (reviewQuestionsToSave.length > 0) {
        await manager.save(MaterialReviewQuestion, reviewQuestionsToSave);
      }

      // 5. Encolar el trabajo en BullMQ si no requiere revisión
      const jobPayload = {
        material_request_id: materialRequest.id,
        tenant_id: tenantId,
        cycle_id: cycleId,
        week_number: dto.week_number,
        template_name: templateName,
        design_template_id: designTemplateId,
        requires_review: dto.requires_review,
        material_type: dto.exam_areas ? 'EXAMEN' : 'BALOTARIO',
        distributions: realDistributions,
        exam_areas: dto.exam_areas,
        tenant: {
          tenant_id: tenantId,
          commercial_name: company?.commercialName || 'Colegio Odiseo Innova',
          logo_url:
            company?.logoUrl ||
            'https://s3.aws.com/tenant-assets/odiseo-innova.png',
        },
      };

      if (!dto.requires_review) {
        // Update courses to PROCESSING
        if (createdCourses.length > 0) {
          await manager.update(
            MaterialRequestCourse,
            { id: In(createdCourses.map((c) => c.id)) },
            {
              status: CourseMaterialStatus.PROCESSING,
            },
          );
        }
        jobsToDispatch.push({ name: 'generate-pdf', data: jobPayload });
      }

      return {
        message: dto.requires_review
          ? 'Solicitud pausada para revisión intermedia.'
          : 'Solicitud de generación encolada exitosamente',
        data: {
          material_request_id: materialRequest.id,
          status: initialStatus,
          estimated_completion: dto.requires_review ? null : '60s',
          courses: coursesResponseList,
        },
      };
    });

    for (const job of jobsToDispatch) {
      await this.materialsQueue.add(job.name, job.data, MATERIALS_JOB_OPTIONS);
    }

    return result;
  }
}
