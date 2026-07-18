import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantService } from '../../database/tenant.service';
import { FlatQuestionsRepository } from '../../question-bank/flat-questions.repository';
import { GcsService } from '../../gcs/gcs.service';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
import { MaterialReviewQuestion } from '../entities/material-review-question.entity';
import { Topic } from '../../catalogs/entities/topic.entity';
import { Subtopic } from '../../catalogs/entities/subtopic.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';
import { CycleMaterialTemplate } from '../../academic-time/entities/cycle-material-template.entity';
import { Syllabus } from '../../syllabus/entities/syllabus.entity';
import { SyllabusDistribution } from '../../syllabus/entities/syllabus-distribution.entity';

@Injectable()
export class GetMaterialReviewUseCase {
  private readonly logger = new Logger(GetMaterialReviewUseCase.name);

  constructor(
    private readonly tenantService: TenantService,
    private readonly flatQuestionsRepo: FlatQuestionsRepository,
    private readonly gcsService: GcsService,
  ) {}

  async execute(id: string): Promise<any> {
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

      const flatQuestions = await this.flatQuestionsRepo.findByIds(questionIds);
      const dbQuestionsMap = new Map(
        flatQuestions.map((q) => [String(q.question_id), q]),
      );

      const missingIds = questionIds.filter(
        (qid) => !dbQuestionsMap.has(String(qid)),
      );
      if (missingIds.length > 0) {
        const fallbackDbQuestions =
          await this.flatQuestionsRepo.findByIdsFromNormalized(missingIds);
        for (const fq of fallbackDbQuestions) {
          dbQuestionsMap.set(String(fq.question_id), fq);
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
              parsedSolution =
                typeof flatQ.solution === 'string'
                  ? JSON.parse(flatQ.solution)
                  : flatQ.solution;
              if (
                typeof parsedSolution !== 'object' ||
                parsedSolution === null
              ) {
                parsedSolution = {};
              }
            } catch (e) {
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
          const textOrigin =
            universityId && flatQ.origins ? flatQ.origins[universityId] : null;

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
      const courseIds = [
        ...new Set(questionsResponse.map((q) => q.courseId).filter(Boolean)),
      ];
      if (template) {
        for (const courseId of courseIds) {
          const syllabus = await manager.findOne(Syllabus, {
            where: { courseId, cycleId: request.cycleId, isActive: true },
          });
          if (!syllabus) continue;

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
        const easy =
          tc?.easyCount !== undefined && tc?.easyCount !== null
            ? tc.easyCount
            : Math.floor(targetQuantity * 0.4);
        const medium =
          tc?.mediumCount !== undefined && tc?.mediumCount !== null
            ? tc.mediumCount
            : Math.floor(targetQuantity * 0.4);
        const hard =
          tc?.hardCount !== undefined && tc?.hardCount !== null
            ? tc.hardCount
            : targetQuantity - easy - medium;
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
}
