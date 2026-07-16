import { Injectable, Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import { GenerateMaterialJobDto } from '../materials/dto/generate-material-job.dto';
import { QuestionBankService } from '../question-bank/question-bank.service';
import { MaterialRequestCourse } from '../materials/entities/material-request-course.entity';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from '../materials/entities/material-review-question.entity';
import { Question } from '../question-bank/entities/question.entity';
import { Topic } from '../catalogs/entities/topic.entity';
import { TenantService } from '../database/tenant.service';

@Injectable()
export class QuestionSelectorService {
  private readonly logger = new Logger(QuestionSelectorService.name);

  constructor(
    private readonly tenantService: TenantService,
    @InjectEntityManager('questionsConnection')
    private readonly questionsEntityManager: EntityManager,
    private readonly questionBankService: QuestionBankService,
  ) {}

  async selectQuestions(job: GenerateMaterialJobDto): Promise<any[]> {
    return this.tenantService.runInTenant(async (manager) => {
      this.logger.log(`Selecting questions for job ${job.job_id}...`);

      // 1. Find the parent request of this course request to check if it was curated
      const courseReq = await manager.findOne(MaterialRequestCourse, {
        where: { id: job.job_id },
      });

      if (courseReq) {
        // 2. Fetch all review questions for this parent request that belong to this course and are approved
        const reviewQuestions = await manager
          .createQueryBuilder(MaterialReviewQuestion, 'mrq')
          .innerJoin(Topic, 't', 't.id = mrq.topic_id')
          .where('mrq.material_request_id = :materialRequestId', {
            materialRequestId: courseReq.materialRequestId,
          })
          .andWhere('t.course_id = :courseId', { courseId: job.course_id })
          .andWhere('mrq.status IN (:...statuses)', {
            statuses: [
              ReviewQuestionStatus.FOUND,
              ReviewQuestionStatus.REPLACED,
            ],
          })
          .orderBy('mrq.position', 'ASC')
          .getMany();

        if (reviewQuestions.length > 0) {
          this.logger.log(
            `Found ${reviewQuestions.length} curated questions for request ${courseReq.materialRequestId}`,
          );

          // 3. Load the actual questions from the database using the curated questionIds
          const questionIds = reviewQuestions
            .map((q) => q.questionId)
            .filter((id): id is string => !!id);

          if (questionIds.length > 0) {
            const dbQuestions = await this.questionsEntityManager.find(
              Question,
              {
                where: { id: In(questionIds) },
                relations: ['alternatives'],
              },
            );

            const questionMap = new Map(dbQuestions.map((q) => [q.id, q]));
            const selectedQuestions: any[] = [];

            for (const mrq of reviewQuestions) {
              if (!mrq.questionId) continue;
              const q = questionMap.get(mrq.questionId);
              if (q) {
                selectedQuestions.push({
                  topic_id: q.topicId,
                  subtopic_id: q.subtopicId,
                  question_text: q.htmlContent,
                  options: q.options,
                });
              }
            }

            return selectedQuestions;
          }
        }
      }

      // 3. Fallback: If no curation questions were found, choose randomly
      this.logger.log(
        `No curated questions found for job ${job.job_id}. Falling back to random selection.`,
      );
      let selectedQuestions: any[] = [];

      let usedQuestionIds: string[] = [];
      if (job.cycle_id) {
        const tenantSchema = `tenant_${job.tenant.tenant_id}`;
        const query = `
          SELECT mrq.question_id 
          FROM ${tenantSchema}.material_review_questions mrq
          INNER JOIN ${tenantSchema}.material_requests r ON mrq.material_request_id = r.id
          WHERE mrq.question_id IS NOT NULL AND r.cycle_id = $1
        `;
        const result = await manager.query(query, [job.cycle_id]);
        usedQuestionIds = result.map((row: any) => row.question_id);
      }

      for (const dist of job.syllabus_distribution) {
        const subQuestions: any[] = [];

        if (dist.easyCount !== undefined || dist.mediumCount !== undefined || dist.hardCount !== undefined) {
          const easyTarget = dist.easyCount || 0;
          const mediumTarget = dist.mediumCount || 0;
          const hardTarget = dist.hardCount || 0;

          if (easyTarget > 0) {
            const easyQs = await this.questionBankService.getRandomQuestions(
              dist.subtopic_id,
              easyTarget,
              usedQuestionIds,
              'EASY',
            );
            subQuestions.push(...easyQs);
          }
          if (mediumTarget > 0) {
            const mediumQs = await this.questionBankService.getRandomQuestions(
              dist.subtopic_id,
              mediumTarget,
              usedQuestionIds,
              'MEDIUM',
            );
            subQuestions.push(...mediumQs);
          }
          if (hardTarget > 0) {
            const hardQs = await this.questionBankService.getRandomQuestions(
              dist.subtopic_id,
              hardTarget,
              usedQuestionIds,
              'HARD',
            );
            subQuestions.push(...hardQs);
          }

          // Fallback if we couldn't meet the target quantity
          if (subQuestions.length < dist.quantity) {
            const missing = dist.quantity - subQuestions.length;
            const fallbackQs = await this.questionBankService.getRandomQuestions(
              dist.subtopic_id,
              missing,
              usedQuestionIds,
              undefined,
            );
            subQuestions.push(...fallbackQs);
          }
        } else {
          const normalQs = await this.questionBankService.getRandomQuestions(
            dist.subtopic_id,
            dist.quantity,
            usedQuestionIds,
            job.difficulty_level,
          );
          subQuestions.push(...normalQs);
        }

        const formatted = subQuestions.map((q) => ({
          topic_id: q.topicId,
          subtopic_id: q.subtopicId,
          question_text: q.htmlContent,
          options: q.options,
        }));

        selectedQuestions = selectedQuestions.concat(formatted);
      }

      return selectedQuestions;
    });
  }
}
