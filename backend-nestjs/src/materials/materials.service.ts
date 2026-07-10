import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Between, EntityManager, In } from 'typeorm';
import { InjectEntityManager } from '@nestjs/typeorm';
import { WebhookStatusRequestDto } from './dto/webhook-status-request.dto';
import { ApproveReviewDto } from './dto/approve-review.dto';
import { MaterialRequest } from './entities/material-request.entity';
import { MaterialRequestStatus } from './entities/material-status.enum';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from './entities/material-request-course.entity';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from './entities/material-review-question.entity';
import { Material } from './entities/material.entity';
import { CycleMaterialTemplate } from '../academic-time/entities/cycle-material-template.entity';
import { Syllabus } from '../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../syllabus/entities/syllabus-distribution.entity';
import { Company } from '../tenants/entities/tenant.entity';
import { Topic } from '../catalogs/entities/topic.entity';
import { Subtopic } from '../catalogs/entities/subtopic.entity';
import { Question } from '../question-bank/entities/question.entity';
import { v4 as uuidv4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { I_MATERIALS_REPOSITORY } from './repositories/i-materials.repository';
import type { IMaterialsRepository } from './repositories/i-materials.repository';
import { TenantService } from '../database/tenant.service';
import { S3Service } from '../aws/s3.service';
import { Cycle } from '../academic-time/entities/cycle.entity';
import { convertUuidToIntegerId } from '../database/uuid-converter';
import { GcsService } from '../gcs/gcs.service';

@Injectable()
export class MaterialsService {
  private readonly logger = new Logger(MaterialsService.name);

  constructor(
    @InjectQueue('materials-queue') private readonly materialsQueue: Queue,
    private readonly cls: ClsService,
    private readonly tenantService: TenantService,
    @Inject(I_MATERIALS_REPOSITORY)
    private readonly materialsRepo: IMaterialsRepository,
    private readonly s3Service: S3Service,
    @InjectEntityManager('questionsConnection')
    private readonly questionsEntityManager: EntityManager,
    private readonly gcsService: GcsService,
  ) {}

  async generateMaterial(dto: {
    course_id: string;
    material_type: string;
    difficulty_level: string;
  }): Promise<any> {
    this.logger.log(
      `Automatic generation requested for course ${dto.course_id}`,
    );
    return 'auto-job-001';
  }

  async updateMaterialStatus(
    statusData: WebhookStatusRequestDto,
  ): Promise<void> {
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
      } else if (statusData.status === 'failed') {
        courseStatus = CourseMaterialStatus.FAILED;
      } else if (statusData.status === 'processing') {
        courseStatus = CourseMaterialStatus.PROCESSING;
      }

      // Update course request
      await manager.update(MaterialRequestCourse, courseReq.id, {
        status: courseStatus,
        downloadUrl: statusData.download_url || undefined,
        warnings: (statusData.error_message
          ? { error: statusData.error_message }
          : null) as any,
      });

      this.logger.log(
        `MaterialRequestCourse ${courseReq.id} updated to ${courseStatus}`,
      );

      // Check if all courses in the parent MaterialRequest are complete
      const siblingCourses = await manager.find(MaterialRequestCourse, {
        where: { materialRequestId: courseReq.materialRequestId },
      });

      const allFinished = siblingCourses.every(
        (c) =>
          c.status === CourseMaterialStatus.COMPLETED ||
          c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS ||
          c.status === CourseMaterialStatus.FAILED,
      );

      if (allFinished) {
        const hasFailed = siblingCourses.some(
          (c) => c.status === CourseMaterialStatus.FAILED,
        );
        const hasWarnings = siblingCourses.some(
          (c) => c.status === CourseMaterialStatus.COMPLETED_WITH_WARNINGS,
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
              this.logger.warn('Cannot dispatch merge job: tenant not identified');
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

  async getReviewData(id: string): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
        relations: ['courses'],
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      // Automatically transition status to IN_REVIEW if current status is REVIEW_REQUIRED
      if (request.status === MaterialRequestStatus.REVIEW_REQUIRED) {
        request.status = MaterialRequestStatus.IN_REVIEW;
        await manager.save(request);
        this.logger.log(
          `MaterialRequest ${id} status auto-transitioned to IN_REVIEW`,
        );
      }

      const questions = await manager.find(MaterialReviewQuestion, {
        where: { materialRequestId: id },
        order: { position: 'ASC' },
      });

      // Load all topics and subtopics to resolve names in memory
      const topics = await manager.find(Topic);
      const subtopics = await manager.find(Subtopic);

      const topicMap = new Map(topics.map((t) => [t.id, t]));
      const subtopicMap = new Map(subtopics.map((s) => [s.id, s]));

      // Fetch questions from external question database
      const questionIds = questions
        .map((q) => q.questionId)
        .filter((qid): qid is string => !!qid);

      let flatQuestions: any[] = [];
      const dbQuestions = questionIds.map((qid) => Number(qid));
      if (dbQuestions.length > 0) {
        flatQuestions = await this.questionsEntityManager.query(
          `SELECT * FROM odiseo.flat_questions WHERE question_id = ANY($1)`,
          [dbQuestions],
        );
      }
      const dbQuestionsMap = new Map(
        flatQuestions.map((q) => [String(q.question_id), q]),
      );

      const missingIds = questionIds.filter(qid => !dbQuestionsMap.has(String(qid)));
      if (missingIds.length > 0) {
        const fallbackDbQuestions = await this.questionsEntityManager.query(
          `SELECT q.id as question_id, q.code, q.level_id, l.name as level_name, q.type, q.description as html_content,
             (SELECT json_agg(json_build_object('id', a.id, 'description', a.description, 'is_correct', a.id = q.answer_id)) 
              FROM odiseo.alternative a WHERE a.question_id = q.id AND a.fl_status = true) as alternatives,
             (SELECT json_agg(json_build_object('id', qi.id, 'code', qi.code, 'gcs_key', qi.image)) 
              FROM odiseo.question_image qi WHERE qi.question_id = q.id AND qi.fl_status = true) as images
           FROM odiseo.question q
           LEFT JOIN odiseo.level l ON q.level_id = l.id
           WHERE q.id = ANY($1)`,
          [missingIds.map((qid) => BigInt(qid))],
        );
        for (const fq of fallbackDbQuestions) {
          const alts = fq.alternatives || [];
          dbQuestionsMap.set(String(fq.question_id), {
            question_id: fq.question_id,
            code: fq.code,
            level_id: fq.level_id,
            level_name: fq.level_name,
            type: fq.type,
            html_content: fq.html_content,
            alternatives: alts.map((alt: any, idx: number) => ({
              id: alt.id,
              label: String.fromCharCode(65 + idx),
              text: alt.description,
              is_correct: alt.is_correct
            })),
            images: fq.images || [],
            solution: null // Solucionario can be added later if needed
          });
        }
      }

      const cycle = await manager.findOne(Cycle, {
        where: { id: request.cycleId },
      });
      const universityId = cycle?.universityId;

      const questionsResponse = await Promise.all(
        questions.map(async (q) => {
          const topic = topicMap.get(q.topicId);
          const subtopic = subtopicMap.get(q.subtopicId);
          const flatQ = q.questionId
            ? dbQuestionsMap.get(String(q.questionId))
            : null;

          if (!flatQ) {
            return {
              id: q.id,
              questionId: q.questionId,
              courseId: topic?.courseId || '',
              topicId: q.topicId,
              topicName: topic?.name || 'Desconocido',
              subtopicId: q.subtopicId,
              subtopicName: subtopic?.name || 'Desconocido',
              expectedLevel: q.expectedLevel,
              position: q.position,
              status: q.status,
              htmlContent: null,
              options: [],
            };
          }

          // Dynamically sign question images
          const signedImages = await Promise.all(
            (flatQ.images || []).map(async (img: any) => ({
              id: img.id,
              code: img.code,
              url: await this.gcsService.getSignedUrl(img.gcs_key),
            })),
          );

          // Dynamically sign solution images
          let parsedSolution: any = {};
          if (flatQ.solution) {
            try {
              parsedSolution = typeof flatQ.solution === 'string' ? JSON.parse(flatQ.solution) : flatQ.solution;
              if (typeof parsedSolution !== 'object' || parsedSolution === null) {
                parsedSolution = {};
              }
            } catch(e) {
              parsedSolution = {};
            }
          }

          const signedDiagImages = await Promise.all(
            (parsedSolution.diagrammed_images || []).map(async (img: any) => ({
              id: img.id,
              code: img.code,
              url: await this.gcsService.getSignedUrl(img.gcs_key),
            })),
          );

          // Resolve university specific origin label
          const textOrigin = universityId && flatQ.origins ? flatQ.origins[universityId] : null;

          return {
            id: q.id,
            questionId: q.questionId,
            courseId: topic?.courseId || '',
            topicId: q.topicId,
            topicName: topic?.name || 'Desconocido',
            subtopicId: q.subtopicId,
            subtopicName: subtopic?.name || 'Desconocido',
            expectedLevel: q.expectedLevel,
            position: q.position,
            status: q.status,
            code: flatQ.code,
            levelId: flatQ.level_id,
            levelName: flatQ.level_name,
            type: flatQ.type,
            htmlContent: flatQ.html_content,
            configAlternative: flatQ.config_alternative,
            options: (flatQ.alternatives || []).map((alt: any) => ({
              label: alt.label,
              text: alt.text,
              isCorrect: alt.is_correct,
            })),
            images: signedImages,
            mathFormulas: flatQ.math_formulas || [],
            alternativeMaths: flatQ.alternative_maths || [],
            solution: {
              diagrammed: parsedSolution.diagrammed || [],
              diagrammedImages: signedDiagImages,
              didiMaths: parsedSolution.didi_maths || [],
            },
            textOrigin: textOrigin || null,
          };
        }),
      );

      const template = await manager.findOne(CycleMaterialTemplate, {
        where: { id: request.profileId },
        relations: ['courses'],
      });

      const allowedSyllabusUnits: any[] = [];
      const courseIds = [...new Set(questionsResponse.map((q) => q.courseId).filter(Boolean))];
      if (template) {
        for (const courseId of courseIds) {
          const syllabus = await manager.findOne(Syllabus, {
            where: { courseId, cycleId: request.cycleId, isActive: true },
          });
          if (!syllabus) {
            continue;
          }

          const distributions = await manager.find(SyllabusDistribution, {
            where: { syllabusId: syllabus.id, weekNumber: request.weekNumber },
          });

          for (const dist of distributions) {
            const topic = topicMap.get(dist.topicId);
            const subtopic = subtopicMap.get(dist.subtopicId);
            allowedSyllabusUnits.push({
              courseId,
              topicId: dist.topicId,
              topicName: topic?.name || 'Desconocido',
              subtopicId: dist.subtopicId,
              subtopicName: subtopic?.name || 'Desconocido',
            });
          }
        }
      }

      const difficultyLimits = courseIds.map((courseId) => {
        const tc = template?.courses?.find((c) => c.courseId === courseId);
        const targetQuantity = tc?.questionsQuantity || 35;
        const easy = tc?.easyCount !== undefined && tc?.easyCount !== null ? tc.easyCount : Math.floor(targetQuantity * 0.4);
        const medium = tc?.mediumCount !== undefined && tc?.mediumCount !== null ? tc.mediumCount : Math.floor(targetQuantity * 0.4);
        const hard = tc?.hardCount !== undefined && tc?.hardCount !== null ? tc.hardCount : (targetQuantity - easy - medium);
        return {
          courseId,
          easy,
          medium,
          hard,
        };
      });

      return {
        materialId: request.id,
        status: request.status,
        version: request.version,
        weekNumber: request.weekNumber,
        cycleName: cycle?.name || 'Desconocido',
        templateName: template?.name || 'Desconocido',
        questions: questionsResponse,
        allowedSyllabusUnits,
        difficultyLimits,
      };
    });
  }

  async saveDraftCuration(id: string, dto: ApproveReviewDto, userId: string): Promise<any> {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new NotFoundException('Tenant not identified');
    }

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

  async approveCuration(id: string, dto: ApproveReviewDto, userId: string): Promise<any> {
    const tenantId = this.cls.get('companyId');
    if (!tenantId) {
      throw new NotFoundException('Tenant not identified');
    }

    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
        relations: ['courses'],
      });
      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      // Optimistic locking concurrency check (T023)
      if (request.version !== dto.version) {
        throw new ConflictException(
          'El material ya está siendo revisado por otro administrador o su estado ha cambiado',
        );
      }

      // 1. Process replacements
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

      // 2. Process removals
      for (const removalId of dto.removals) {
        await manager.update(
          MaterialReviewQuestion,
          { id: removalId, materialRequestId: id },
          {
            status: ReviewQuestionStatus.REMOVED,
          },
        );
      }

      // Check for unresolved empty slots
      const updatedQuestions = await manager.find(MaterialReviewQuestion, {
        where: { materialRequestId: id },
      });
      const hasEmpty = updatedQuestions.some(
        (q) => q.status === ReviewQuestionStatus.EMPTY,
      );

      if (hasEmpty && !dto.continueWithWarnings) {
        throw new BadRequestException('Existen slots vacíos no resueltos');
      }

      const alreadyGenerated = request.courses.some(c => c.downloadUrl != null);
      const noChanges = dto.replacements.length === 0 && dto.removals.length === 0;

      if (alreadyGenerated && noChanges) {
        const finalStatus = hasEmpty ? MaterialRequestStatus.COMPLETED_WITH_WARNINGS : MaterialRequestStatus.COMPLETED;
        request.status = finalStatus;
        // La versión se incrementa automáticamente por el @VersionColumn() de TypeORM al guardar
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

      // 3. Update parent request status
      request.status = MaterialRequestStatus.PROCESSING;
      // La versión se incrementa automáticamente por el @VersionColumn() de TypeORM al guardar
      await manager.save(request);

      if (request.materialId) {
        await manager.update(Material, request.materialId, {
          status: MaterialRequestStatus.PROCESSING,
        });
        this.logger.log(
          `Parent Material ${request.materialId} status updated to PROCESSING`,
        );
      }

      // Fetch company branding again to build SQS jobs
      const company = await manager.findOne(Company, {
        where: { id: tenantId },
      });

      // 4. Dispatch tasks to SQS for the worker
      for (const courseReq of request.courses) {
        // Update course requests to PROCESSING
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

        // Load distributions for this course in the requested week
        let distributions: SyllabusDistribution[] = [];
        const template = await manager.findOne(CycleMaterialTemplate, {
          where: { id: request.profileId },
        });
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
          material_type: 'BALOTARIO',
          course_id: courseReq.courseId,
          difficulty_level: 'MEDIA',
          syllabus_distribution: syllabusPayload,
          notification: {
            admin_user_id: userId,
          },
        };

        await this.materialsQueue.add('generate', job);
      }

      this.logger.log(
        `Curation approved for MaterialRequest ${id}. Dispatched jobs to BullMQ.`,
      );

      return {
        status: MaterialRequestStatus.PROCESSING,
        message: 'Generación de PDFs iniciada',
      };
    });
  }

  async getDownloadUrl(id: string, courseId: string): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const courseReq = await manager.findOne(MaterialRequestCourse, {
        where: { materialRequestId: id, courseId },
      });

      if (!courseReq) {
        throw new NotFoundException(
          'El curso solicitado no forma parte de esta solicitud de material',
        );
      }

      if (
        (courseReq.status !== CourseMaterialStatus.COMPLETED &&
          courseReq.status !== CourseMaterialStatus.COMPLETED_WITH_WARNINGS) ||
        !courseReq.downloadUrl
      ) {
        throw new BadRequestException(
          'El material aún no está listo o falló su generación',
        );
      }

      let key = courseReq.downloadUrl;
      if (key.startsWith('http')) {
        try {
          const urlObj = new URL(key);
          const parts = urlObj.pathname.split('/');
          key = parts.slice(2).join('/');
        } catch (e) {
          // Fallback if parsing fails
          key = courseReq.downloadUrl;
        }
      }

      const signedUrl = await this.s3Service.getPresignedDownloadUrl(key, 3600);

      return {
        materialId: id,
        courseId,
        downloadUrl: signedUrl,
        s3Key: key,
        filename: key.split('/').pop(),
        expiresIn: 3600,
      };
    });
  }

  async updateMergedDownloadUrl(
    materialRequestId: string,
    mergedUrl: string,
  ): Promise<void> {
    return this.tenantService.runInTenant(async (manager) => {
      await manager.update(MaterialRequest, materialRequestId, {
        mergedDownloadUrl: mergedUrl,
      });
      this.logger.log(
        `Merged download URL updated for MaterialRequest ${materialRequestId}`,
      );
    });
  }

  async getCoursesForMerge(materialRequestId: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(MaterialRequestCourse, {
        where: { materialRequestId },
      });
    });
  }

  async getMergedDownloadUrl(id: string): Promise<any> {
    return this.tenantService.runInTenant(async (manager) => {
      const request = await manager.findOne(MaterialRequest, {
        where: { id },
      });

      if (!request) {
        throw new NotFoundException('La solicitud de material no existe');
      }

      if (!request.mergedDownloadUrl) {
        throw new BadRequestException(
          'El PDF combinado aún no está disponible',
        );
      }

      let key = request.mergedDownloadUrl;
      if (key.startsWith('http')) {
        try {
          const urlObj = new URL(key);
          const parts = urlObj.pathname.split('/');
          key = parts.slice(2).join('/');
        } catch (e) {
          key = request.mergedDownloadUrl;
        }
      }

      const signedUrl = await this.s3Service.getPresignedDownloadUrl(key, 3600);

      return {
        materialId: id,
        downloadUrl: signedUrl,
        s3Key: key,
        filename: key.split('/').pop(),
        expiresIn: 3600,
      };
    });
  }

  async streamDownload(s3Key: string): Promise<Buffer> {
    return this.s3Service.getObject(s3Key);
  }

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
        id: m.latestRequestId || m.id, // Compatibility fallback: use latestRequestId as ID for download endpoints
        materialId: m.id, // Real logical Material ID
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
        mergedDownloadUrl: m.latestRequest?.mergedDownloadUrl || null,
        requiresReview: m.latestRequest?.requiresReview || false,
      }));
    });
  }

  async getAttempts(materialId: string): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      return manager.find(MaterialRequest, {
        where: { materialId },
        relations: ['courses'],
        order: { createdAt: 'DESC' },
      });
    });
  }

  async getQuestionPreview(questionId: string): Promise<any> {
    const dbQuestionId = Number(questionId);
    if (isNaN(dbQuestionId)) {
      throw new BadRequestException('ID de pregunta inválido');
    }

    let flatQ: any = null;
    const flatQuestions = await this.questionsEntityManager.query(
      `SELECT * FROM odiseo.flat_questions WHERE question_id = $1`,
      [dbQuestionId],
    );

    if (flatQuestions.length > 0) {
      flatQ = flatQuestions[0];
    } else {
      const fallbackDbQuestions = await this.questionsEntityManager.query(
        `SELECT q.id as question_id, q.code, q.level_id, l.name as level_name, q.type, q.description as html_content,
           (SELECT json_agg(json_build_object('id', a.id, 'description', a.description, 'is_correct', a.id = q.answer_id)) 
            FROM odiseo.alternative a WHERE a.question_id = q.id AND a.fl_status = true) as alternatives,
           (SELECT json_agg(json_build_object('id', qi.id, 'code', qi.code, 'gcs_key', qi.image)) 
            FROM odiseo.question_image qi WHERE qi.question_id = q.id AND qi.fl_status = true) as images
         FROM odiseo.question q
         LEFT JOIN odiseo.level l ON q.level_id = l.id
         WHERE q.id = $1 AND q.fl_status = true`,
        [dbQuestionId],
      );

      if (fallbackDbQuestions.length === 0) {
        throw new NotFoundException('Pregunta no encontrada');
      }

      const fq = fallbackDbQuestions[0];
      const alts = fq.alternatives || [];
      flatQ = {
        question_id: fq.question_id,
        code: fq.code,
        level_id: fq.level_id,
        level_name: fq.level_name,
        type: fq.type,
        html_content: fq.html_content,
        alternatives: alts.map((alt: any, idx: number) => ({
          id: alt.id,
          label: String.fromCharCode(65 + idx),
          text: alt.description,
          is_correct: alt.is_correct
        })),
        images: fq.images || [],
        solution: null
      };
    }
    return this.mapFlatQuestion(flatQ);
  }

  async getQuestionAlternatives(
    courseId?: string,
    topicId?: string,
    subtopicId?: string,
    levelIdOrExpectedLevel?: string,
    limit: number = 3,
    excludeIds: string[] = [],
  ): Promise<any[]> {
    const buildQuery = (levelFilter: string | null, excludedQuestionIds: string[]) => {
      let sql = `
        SELECT fq.* 
        FROM odiseo.flat_questions fq
        INNER JOIN odiseo.question_subtopic qs ON fq.question_id = qs.question_id
        INNER JOIN odiseo.subtopic s ON qs.subtopic_id = s.id
        ${courseId ? 'INNER JOIN odiseo.topic t ON s.topic_id = t.id' : ''}
        WHERE qs.fl_status = true
      `;
      const queryParams: any[] = [];

      if (subtopicId) {
        const subtopicIds = subtopicId.split(',').filter(Boolean);
        if (subtopicIds.length > 0) {
          const numericSubtopicIds = subtopicIds.map(convertUuidToIntegerId);
          sql += ` AND s.id IN (${numericSubtopicIds.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericSubtopicIds);
        }
      } else if (topicId) {
        const topicIds = topicId.split(',').filter(Boolean);
        if (topicIds.length > 0) {
          const numericTopicIds = topicIds.map(convertUuidToIntegerId);
          sql += ` AND s.topic_id IN (${numericTopicIds.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericTopicIds);
        }
      } else if (courseId) {
        const courseIds = courseId.split(',').filter(Boolean);
        if (courseIds.length > 0) {
          const numericCourseIds = courseIds.map(convertUuidToIntegerId);
          sql += ` AND t.course_id IN (${numericCourseIds.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericCourseIds);
        }
      }

      if (levelFilter) {
        const upperDiff = String(levelFilter).toUpperCase();
        if (upperDiff === 'EASY' || upperDiff === 'FACIL') {
          sql += ` AND fq.level_id IN (43, 44)`;
        } else if (upperDiff === 'MEDIUM' || upperDiff === 'INTERMEDIO') {
          sql += ` AND fq.level_id = 45`;
        } else if (upperDiff === 'HARD' || upperDiff === 'DIFICIL') {
          sql += ` AND fq.level_id IN (46, 47, 48, 49, 50, 51, 52)`;
        } else {
          sql += ` AND fq.level_id = $${queryParams.length + 1}`;
          queryParams.push(Number(levelFilter));
        }
      }

      if (excludedQuestionIds.length > 0) {
        const numericExcludeIds = excludedQuestionIds
          .map(id => {
            const num = Number(id);
            return isNaN(num) ? convertUuidToIntegerId(id) : num;
          })
          .filter(id => !isNaN(id));
        if (numericExcludeIds.length > 0) {
          sql += ` AND fq.question_id NOT IN (${numericExcludeIds.map((_, i) => `$${queryParams.length + 1 + i}`).join(', ')})`;
          queryParams.push(...numericExcludeIds);
        }
      }

      sql += ` ORDER BY RANDOM() LIMIT $${queryParams.length + 1}`;
      queryParams.push(limit);

      return { sql, queryParams };
    };

    // 1. Try to fetch with the requested level filter first
    const primarySearch = buildQuery(levelIdOrExpectedLevel || null, excludeIds);
    let flatQuestions = await this.questionsEntityManager.query(primarySearch.sql, primarySearch.queryParams);

    // 2. If we don't have enough results and a level filter was specified, fetch fallback questions from the same subtopic (any difficulty)
    if (flatQuestions.length < limit && levelIdOrExpectedLevel) {
      const remainingLimit = limit - flatQuestions.length;
      const alreadyFoundIds = flatQuestions.map((q: any) => String(q.question_id));
      const combinedExcludeIds = [...excludeIds, ...alreadyFoundIds];
      
      const fallbackSearch = buildQuery(null, combinedExcludeIds);
      // Adjust limit in parameters
      fallbackSearch.queryParams[fallbackSearch.queryParams.length - 1] = remainingLimit;

      const fallbackQuestions = await this.questionsEntityManager.query(fallbackSearch.sql, fallbackSearch.queryParams);
      flatQuestions = [...flatQuestions, ...fallbackQuestions];
    }

    return await Promise.all(
      flatQuestions.map((flatQ: any) => this.mapFlatQuestion(flatQ))
    );
  }


  private async mapFlatQuestion(flatQ: any): Promise<any> {
    const signedImages = await Promise.all(
      (flatQ.images || []).map(async (img: any) => ({
        id: img.id,
        code: img.code,
        url: await this.gcsService.getSignedUrl(img.gcs_key),
      })),
    );

    let parsedSolution: any = {};
    if (flatQ.solution) {
      try {
        parsedSolution = typeof flatQ.solution === 'string' ? JSON.parse(flatQ.solution) : flatQ.solution;
        if (typeof parsedSolution !== 'object' || parsedSolution === null) {
          parsedSolution = {};
        }
      } catch(e) {
        parsedSolution = {};
      }
    }

    const signedDiagImages = await Promise.all(
      (parsedSolution.diagrammed_images || []).map(async (img: any) => ({
        id: img.id,
        code: img.code,
        url: await this.gcsService.getSignedUrl(img.gcs_key),
      })),
    );

    return {
      questionId: String(flatQ.question_id),
      code: flatQ.code,
      levelId: flatQ.level_id,
      levelName: flatQ.level_name || 'Desconocido',
      type: flatQ.type,
      htmlContent: flatQ.html_content,
      configAlternative: flatQ.config_alternative,
      options: (flatQ.alternatives || []).map((alt: any) => ({
        label: alt.label,
        text: alt.text,
        isCorrect: alt.is_correct,
      })),
      images: signedImages,
      mathFormulas: flatQ.math_formulas || [],
      alternativeMaths: flatQ.alternative_maths || [],
      solution: {
        diagrammed: parsedSolution.diagrammed || [],
        diagrammedImages: signedDiagImages,
        didiMaths: parsedSolution.didi_maths || [],
      },
    };
  }
}
