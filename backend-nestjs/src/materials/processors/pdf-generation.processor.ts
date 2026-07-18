import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger, Inject } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, In } from 'typeorm';
import {
  CoreApiService,
  ExtractedQuestion,
} from '../services/core-api.service';
import {
  PdfGeneratorService,
  DesignTemplateConfig,
} from '../services/pdf-generator.service';
import { S3Service } from '../../aws/s3.service';
import { MaterialDownloadsUseCase } from '../use-cases/material-downloads.use-case';
import { HandleMaterialWebhookUseCase } from '../use-cases/handle-material-webhook.use-case';
import { ClsService } from 'nestjs-cls';
import {
  I_MATERIALS_REPOSITORY,
  type IMaterialsRepository,
} from '../repositories/i-materials.repository';
import { CourseMaterialStatus } from '../entities/material-request-course.entity';
import { PdfDesignTemplate } from '../entities/pdf-design-template.entity';
import { PDFDocument } from 'pdf-lib';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from '../entities/material-review-question.entity';
import { Topic } from '../../catalogs/entities/topic.entity';
import { Question } from '../../question-bank/entities/question.entity';
import { TenantService } from '../../database/tenant.service';
import { MaterialQuestionUsage } from '../entities/material-question-usage.entity';
import { Cycle } from '../../academic-time/entities/cycle.entity';
import { GcsService } from '../../gcs/gcs.service';
import { FlatQuestionsRepository } from '../../question-bank/flat-questions.repository';

@Processor('materials-queue')
export class PdfGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  constructor(
    private readonly coreApiService: CoreApiService,
    private readonly pdfGeneratorService: PdfGeneratorService,
    private readonly s3Service: S3Service,
    private readonly materialDownloadsUseCase: MaterialDownloadsUseCase,
    private readonly handleMaterialWebhookUseCase: HandleMaterialWebhookUseCase,
    private readonly cls: ClsService,
    @Inject(I_MATERIALS_REPOSITORY)
    private readonly materialsRepo: IMaterialsRepository,
    @InjectEntityManager()
    private readonly entityManager: EntityManager,
    private readonly flatQuestionsRepo: FlatQuestionsRepository,
    private readonly tenantService: TenantService,
    private readonly gcsService: GcsService,
  ) {
    super();
  }

  private async loadDesignTemplate(
    tenantId: string,
    designTemplateId?: string,
  ): Promise<DesignTemplateConfig | null> {
    if (!designTemplateId) return null;
    try {
      const schemaName = 'tenant_' + tenantId;
      const design = await this.cls.runWith(
        { tenantSchema: schemaName } as any,
        async () => {
          return this.entityManager.findOne(PdfDesignTemplate, {
            where: { id: designTemplateId },
          });
        },
      );
      if (!design) {
        this.logger.warn(
          `Design template ${designTemplateId} not found for tenant ${tenantId}`,
        );
        return null;
      }
      this.logger.log(
        `Loaded design template "${design.name}" (${designTemplateId}) for tenant ${tenantId}`,
      );
      return {
        bannerImageUrl: design.bannerImageUrl,
        watermarkImageUrl: design.watermarkImageUrl,
        coverImageUrl: design.coverImageUrl,
        showCover: design.showCover,
        primaryTitleColor: design.primaryTitleColor,
        secondaryTitleColor: design.secondaryTitleColor,
        backgroundHighlightColor: design.backgroundHighlightColor,
        marginTop: design.marginTop,
        marginBottom: design.marginBottom,
        marginInside: design.marginInside,
        marginOutside: design.marginOutside,
        isBookMode: design.isBookMode,
        fontFamily: design.fontFamily,
        borderRadius: design.borderRadius,
        blocksConfig: design.blocksConfig,
        headerConfig: design.headerConfig,
        footerConfig: design.footerConfig,
      };
    } catch (err: any) {
      this.logger.warn(
        `Failed to load design template ${designTemplateId}: ${err.message}`,
      );
      return null;
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);

    if (job.name === 'generate-pdf') {
      return this.handleGeneratePdf(job.data);
    }

    if (job.name === 'generate') {
      return this.handleGenerateSingleCourse(job.data);
    }

    if (job.name === 'merge-pdf') {
      return this.handleMergePdf(job.data);
    }

    return {};
  }

  private async handleGeneratePdf(data: any) {
    const {
      tenant_id,
      cycle_id,
      material_request_id,
      distributions,
      tenant,
      week_number,
      template_name,
      design_template_id,
    } = data;
    const schemaName = 'tenant_' + tenant_id;

    return this.cls.runWith({ tenantSchema: schemaName } as any, async () => {
      const tenantMock = tenant || {
        commercial_name: 'Odiseo',
        logo_url: '',
      };
      const design = await this.loadDesignTemplate(
        tenant_id,
        design_template_id,
      );
      if (design) {
        this.logger.log(
          `Applying design template ${design_template_id} for request ${material_request_id}`,
        );
      }
      const results: {
        courseId: string;
        pdfBuffer: Buffer;
        keysPdfBuffer: Buffer;
        solutionPdfBuffer: Buffer;
        warnings: string[];
      }[] = [];

      for (const dist of distributions) {
        const courseId = dist.course_id;
        let allQuestions: ExtractedQuestion[] = [];
        const missingDesglose: string[] = [];

        try {
          // Try to load curated review questions first
          let reviewQuestions: MaterialReviewQuestion[] = [];
          await this.tenantService.runInSchema(schemaName, async (manager) => {
            reviewQuestions = await manager
              .createQueryBuilder(MaterialReviewQuestion, 'mrq')
              .innerJoin(Topic, 't', 't.id = mrq.topic_id')
              .where('mrq.material_request_id = :materialRequestId', {
                materialRequestId: material_request_id,
              })
              .andWhere('t.course_id = :courseId', { courseId })
              .orderBy('mrq.position', 'ASC')
              .getMany();
          });

          if (reviewQuestions.length > 0) {
            this.logger.log(
              `Found ${reviewQuestions.length} review questions in DB for request ${material_request_id} course ${courseId}`,
            );

            const questionIds = reviewQuestions
              .map((q) => q.questionId)
              .filter((id): id is string => !!id);

            let questionMap = new Map<string, any>();
            if (questionIds.length > 0) {
              const dbQuestions =
                await this.flatQuestionsRepo.findByIds(questionIds);
              questionMap = new Map(
                dbQuestions.map((q: any) => [String(q.question_id), q]),
              );
            }

            let universityId: string | undefined | null;
            await this.tenantService.runInSchema(
              schemaName,
              async (manager) => {
                const cycle = await manager.findOne(Cycle, {
                  where: { id: cycle_id },
                });
                universityId = cycle?.universityId;
              },
            );

            for (const mrq of reviewQuestions) {
              if (mrq.status === ReviewQuestionStatus.EMPTY) {
                missingDesglose.push(
                  `Falta pregunta de subtema ${mrq.subtopicId}`,
                );
              } else if (mrq.status === ReviewQuestionStatus.REMOVED) {
                missingDesglose.push(
                  `Pregunta descartada en subtema ${mrq.subtopicId}`,
                );
              } else {
                if (mrq.questionId) {
                  const q = questionMap.get(mrq.questionId);
                  if (q) {
                    // A signing failure throws and is deliberately left to
                    // reach this course's `catch` below, which reports the
                    // course as `failed` and fails the job. Swallowing it
                    // would put an empty `src` in the PDF, shipping an exam
                    // with missing images under a `completed` status.
                    const signedImages = await Promise.all(
                      (q.images || []).map(async (img: any) => ({
                        id: img.id,
                        url: await this.gcsService.getSignedUrl(img.gcs_key),
                      })),
                    );

                    const signedDiagImages = await Promise.all(
                      (q.solution?.diagrammed_images || []).map(
                        async (img: any) => ({
                          id: img.id,
                          url: await this.gcsService.getSignedUrl(img.gcs_key),
                        }),
                      ),
                    );

                    const textOrigin =
                      universityId && q.origins
                        ? q.origins[universityId]
                        : null;

                    allQuestions.push({
                      id: String(q.question_id),
                      topicId: mrq.topicId,
                      subtopicId: mrq.subtopicId,
                      code: q.code,
                      content: q.html_content,
                      options: (q.alternatives || []).map((alt: any) => ({
                        label: alt.label,
                        text: alt.text,
                        isCorrect: alt.is_correct,
                      })),
                      configAlternative: q.config_alternative,
                      images: signedImages,
                      solution: {
                        diagrammed: q.solution?.diagrammed || [],
                        diagrammedImages: signedDiagImages,
                        didiMaths: q.solution?.didi_maths || [],
                      },
                      textOrigin: textOrigin || 'Desconocido',
                    });
                  } else {
                    missingDesglose.push(
                      `Falta reactivo con ID ${mrq.questionId} en posición ${mrq.position}`,
                    );
                  }
                } else {
                  missingDesglose.push(
                    `Falta pregunta de subtema ${mrq.subtopicId}`,
                  );
                }
              }
            }
          } else {
            // Fallback: fetch random questions from mock/bank
            for (const topic of dist.topics) {
              const qs = await this.coreApiService.fetchQuestions(
                topic.topic_id,
                topic.subtopic_id,
                topic.quantity,
                dist.exclude_question_ids,
                tenant_id,
                cycle_id,
              );
              allQuestions = allQuestions.concat(qs);
              if (qs.length < topic.quantity) {
                missingDesglose.push(
                  `Faltan ${topic.quantity - qs.length} de subtema ${topic.subtopic_id}`,
                );
              }
            }
          }

          if (allQuestions.length === 0) {
            this.logger.warn(
              `No questions found for course ${courseId}. Skipping PDF generation.`,
            );
            if (dist.course_request_id) {
              await this.handleMaterialWebhookUseCase.execute({
                job_id: dist.course_request_id,
                status: 'empty_bank',
                error_message:
                  'Banco vacío. No se encontraron reactivos para este curso.',
              });
            }
            continue; // Skip to next course
          }

          // 1. Student PDF (standard)
          const pdfBuffer = await this.pdfGeneratorService.generatePdf(
            tenantMock,
            courseId,
            allQuestions,
            design,
            week_number,
            template_name,
            false,
            false,
          );

          const safeName =
            `${template_name || 'Material'}_Semana${week_number || ''}_${courseId}`.replace(
              /[^a-zA-Z0-9_\-]/g,
              '_',
            );
          const s3Key = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}.pdf`;
          const downloadUrl = await this.s3Service.uploadBuffer(
            s3Key,
            pdfBuffer,
            'application/pdf',
          );

          // 2. Keys PDF (answer key table at the end)
          const keysPdfBuffer = await this.pdfGeneratorService.generatePdf(
            tenantMock,
            courseId,
            allQuestions,
            design,
            week_number,
            template_name,
            false,
            true,
          );
          const keysS3Key = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}_keys.pdf`;
          const keyDownloadUrl = await this.s3Service.uploadBuffer(
            keysS3Key,
            keysPdfBuffer,
            'application/pdf',
          );

          // 3. Solutions PDF (step-by-step resolution)
          const solutionPdfBuffer = await this.pdfGeneratorService.generatePdf(
            tenantMock,
            courseId,
            allQuestions,
            design,
            week_number,
            template_name,
            true,
            false,
          );
          const solutionS3Key = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}_solutions.pdf`;
          const solutionDownloadUrl = await this.s3Service.uploadBuffer(
            solutionS3Key,
            solutionPdfBuffer,
            'application/pdf',
          );

          const status =
            missingDesglose.length > 0
              ? CourseMaterialStatus.COMPLETED_WITH_WARNINGS
              : CourseMaterialStatus.COMPLETED;

          if (dist.course_request_id) {
            await this.handleMaterialWebhookUseCase.execute({
              job_id: dist.course_request_id,
              status:
                status === CourseMaterialStatus.COMPLETED
                  ? 'completed'
                  : 'completed_with_warnings',
              download_url: downloadUrl,
              key_download_url: keyDownloadUrl,
              solution_download_url: solutionDownloadUrl,
              error_message:
                missingDesglose.length > 0
                  ? missingDesglose.join(', ')
                  : undefined,
            });
          }

          // Save question usages (idempotent: a job retry re-generates this
          // course, so clear prior usages for this request+course before
          // re-inserting to avoid duplicating the anti-repetition ledger).
          if (allQuestions.length > 0) {
            await this.tenantService.runInSchema(
              schemaName,
              async (manager) => {
                await manager.delete(MaterialQuestionUsage, {
                  materialRequestId: material_request_id,
                  courseId,
                });
                const usages = allQuestions.map((q, idx) => {
                  const u = new MaterialQuestionUsage();
                  u.materialRequestId = material_request_id;
                  u.cycleId = cycle_id;
                  u.questionId = q.id;
                  u.courseId = courseId;
                  u.topicId = q.topicId;
                  u.subtopicId = q.subtopicId;
                  u.positionInPdf = idx + 1;
                  u.wasReplacement = false;
                  return u;
                });
                await manager.save(MaterialQuestionUsage, usages);
              },
            );
          }

          results.push({
            courseId,
            pdfBuffer,
            keysPdfBuffer,
            solutionPdfBuffer,
            warnings: missingDesglose,
          });
        } catch (error: any) {
          this.logger.error(
            `Error generating PDF for course ${courseId}: ${error.message}`,
          );

          if (dist.course_request_id) {
            await this.handleMaterialWebhookUseCase.execute({
              job_id: dist.course_request_id,
              status: 'failed',
              error_message: error.message,
            });
          }

          throw error;
        }
      }

      // Generate merged PDF after all courses are processed
      if (results.length > 1) {
        try {
          const safeName =
            `${template_name || 'Material'}_Semana${week_number || ''}_Completo`.replace(
              /[^a-zA-Z0-9_\-]/g,
              '_',
            );

          // Merge Student PDFs
          const mergedPdf = await PDFDocument.create();
          for (const result of results) {
            const pdfDoc = await PDFDocument.load(result.pdfBuffer);
            const pages = await mergedPdf.copyPages(
              pdfDoc,
              pdfDoc.getPageIndices(),
            );
            pages.forEach((page) => mergedPdf.addPage(page));
          }
          const mergedBuffer = Buffer.from(await mergedPdf.save());
          const mergedKey = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}.pdf`;
          const mergedUrl = await this.s3Service.uploadBuffer(
            mergedKey,
            mergedBuffer,
            'application/pdf',
          );

          // Merge Keys PDFs
          const mergedKeysPdf = await PDFDocument.create();
          for (const result of results) {
            const pdfDoc = await PDFDocument.load(result.keysPdfBuffer);
            const pages = await mergedKeysPdf.copyPages(
              pdfDoc,
              pdfDoc.getPageIndices(),
            );
            pages.forEach((page) => mergedKeysPdf.addPage(page));
          }
          const mergedKeysBuffer = Buffer.from(await mergedKeysPdf.save());
          const mergedKeysKey = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}_keys.pdf`;
          const mergedKeysUrl = await this.s3Service.uploadBuffer(
            mergedKeysKey,
            mergedKeysBuffer,
            'application/pdf',
          );

          // Merge Solutions PDFs
          const mergedSolutionsPdf = await PDFDocument.create();
          for (const result of results) {
            const pdfDoc = await PDFDocument.load(result.solutionPdfBuffer);
            const pages = await mergedSolutionsPdf.copyPages(
              pdfDoc,
              pdfDoc.getPageIndices(),
            );
            pages.forEach((page) => mergedSolutionsPdf.addPage(page));
          }
          const mergedSolutionsBuffer = Buffer.from(
            await mergedSolutionsPdf.save(),
          );
          const mergedSolutionsKey = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}_solutions.pdf`;
          const mergedSolutionsUrl = await this.s3Service.uploadBuffer(
            mergedSolutionsKey,
            mergedSolutionsBuffer,
            'application/pdf',
          );

          await this.materialDownloadsUseCase.updateMergedDownloadUrl(
            material_request_id,
            mergedUrl,
            mergedKeysUrl,
            mergedSolutionsUrl,
          );

          this.logger.log(
            `Merged PDFs uploaded for request ${material_request_id}: ${mergedUrl}`,
          );
        } catch (error: any) {
          this.logger.error(`Failed to generate merged PDF: ${error.message}`);
        }
      }

      return { processed: results.length };
    });
  }

  private async handleGenerateSingleCourse(data: any) {
    const {
      tenant_id,
      cycle_id,
      material_request_id,
      tenant,
      week_number,
      template_name,
      design_template_id,
    } = data;
    const schemaName = 'tenant_' + tenant_id;

    return this.cls.runWith({ tenantSchema: schemaName } as any, async () => {
      const tenantMock = tenant || {
        commercial_name: 'Odiseo',
        logo_url: '',
      };
      const design = await this.loadDesignTemplate(
        tenant_id,
        design_template_id,
      );
      const dist = data.distributions?.[0] || {
        course_id: data.course_id,
        topics: data.syllabus_distribution || [],
        exclude_question_ids: [],
        course_request_id: data.job_id,
      };
      const courseId = dist.course_id;
      let allQuestions: ExtractedQuestion[] = [];
      const missingDesglose: string[] = [];

      try {
        // Try to load curated review questions first
        let reviewQuestions: MaterialReviewQuestion[] = [];
        await this.tenantService.runInSchema(schemaName, async (manager) => {
          reviewQuestions = await manager
            .createQueryBuilder(MaterialReviewQuestion, 'mrq')
            .innerJoin(Topic, 't', 't.id = mrq.topic_id')
            .where('mrq.material_request_id = :materialRequestId', {
              materialRequestId: material_request_id,
            })
            .andWhere('t.course_id = :courseId', { courseId })
            .orderBy('mrq.position', 'ASC')
            .getMany();
        });

        if (reviewQuestions.length > 0) {
          this.logger.log(
            `Found ${reviewQuestions.length} review questions in DB for single course request ${material_request_id} course ${courseId}`,
          );

          const questionIds = reviewQuestions
            .map((q) => q.questionId)
            .filter((id): id is string => !!id);

          let questionMap = new Map<string, any>();
          if (questionIds.length > 0) {
            const dbQuestions =
              await this.flatQuestionsRepo.findByIds(questionIds);
            questionMap = new Map(
              dbQuestions.map((q: any) => [String(q.question_id), q]),
            );
          }

          let universityId: string | undefined | null;
          await this.tenantService.runInSchema(schemaName, async (manager) => {
            const cycle = await manager.findOne(Cycle, {
              where: { id: cycle_id },
            });
            universityId = cycle?.universityId;
          });

          for (const mrq of reviewQuestions) {
            if (mrq.status === ReviewQuestionStatus.EMPTY) {
              missingDesglose.push(
                `Falta pregunta de subtema ${mrq.subtopicId}`,
              );
            } else if (mrq.status === ReviewQuestionStatus.REMOVED) {
              missingDesglose.push(
                `Pregunta descartada en subtema ${mrq.subtopicId}`,
              );
            } else {
              if (mrq.questionId) {
                const q = questionMap.get(mrq.questionId);
                if (q) {
                  // See handleGeneratePdf: a signing failure must fail this
                  // course via the `catch` below rather than emit an empty
                  // image `src` into a PDF reported as completed.
                  const signedImages = await Promise.all(
                    (q.images || []).map(async (img: any) => ({
                      id: img.id,
                      url: await this.gcsService.getSignedUrl(img.gcs_key),
                    })),
                  );

                  const signedDiagImages = await Promise.all(
                    (q.solution?.diagrammed_images || []).map(
                      async (img: any) => ({
                        id: img.id,
                        url: await this.gcsService.getSignedUrl(img.gcs_key),
                      }),
                    ),
                  );

                  const textOrigin =
                    universityId && q.origins ? q.origins[universityId] : null;

                  allQuestions.push({
                    id: String(q.question_id),
                    topicId: mrq.topicId,
                    subtopicId: mrq.subtopicId,
                    code: q.code,
                    content: q.html_content,
                    options: (q.alternatives || []).map((alt: any) => ({
                      label: alt.label,
                      text: alt.text,
                      isCorrect: alt.is_correct,
                    })),
                    configAlternative: q.config_alternative,
                    images: signedImages,
                    solution: {
                      diagrammed: q.solution?.diagrammed || [],
                      diagrammedImages: signedDiagImages,
                      didiMaths: q.solution?.didi_maths || [],
                    },
                    textOrigin: textOrigin || 'Desconocido',
                  });
                } else {
                  missingDesglose.push(
                    `Falta reactivo con ID ${mrq.questionId} en posición ${mrq.position}`,
                  );
                }
              } else {
                missingDesglose.push(
                  `Falta pregunta de subtema ${mrq.subtopicId}`,
                );
              }
            }
          }
        } else {
          // Fallback: fetch random questions from mock/bank
          if (dist.topics && dist.topics.length > 0) {
            for (const topic of dist.topics) {
              const qs = await this.coreApiService.fetchQuestions(
                topic.topic_id,
                topic.subtopic_id,
                topic.quantity,
                dist.exclude_question_ids,
                tenant_id,
                cycle_id,
              );
              allQuestions = allQuestions.concat(qs);
              if (qs.length < topic.quantity) {
                missingDesglose.push(
                  `Faltan ${topic.quantity - qs.length} de subtema ${topic.subtopic_id}`,
                );
              }
            }
          }
        }

        if (allQuestions.length === 0) {
          this.logger.warn(
            `No questions found for course ${courseId}. Skipping PDF generation.`,
          );
          if (dist.course_request_id) {
            await this.handleMaterialWebhookUseCase.execute({
              job_id: dist.course_request_id,
              status: 'empty_bank',
              error_message:
                'Banco vacío. No se encontraron reactivos para este curso.',
            });
          }
          return {
            course_id: courseId,
            status: CourseMaterialStatus.EMPTY_BANK,
          };
        }

        const pdfBuffer = await this.pdfGeneratorService.generatePdf(
          tenantMock,
          courseId,
          allQuestions,
          design,
          week_number,
          template_name,
        );

        const safeName =
          `${template_name || 'Material'}_Semana${week_number || ''}_${courseId}`.replace(
            /[^a-zA-Z0-9_\-]/g,
            '_',
          );
        const s3Key = `materials/${tenant_id}/${cycle_id}/${material_request_id}/${safeName}.pdf`;
        const downloadUrl = await this.s3Service.uploadBuffer(
          s3Key,
          pdfBuffer,
          'application/pdf',
        );

        const status =
          missingDesglose.length > 0
            ? CourseMaterialStatus.COMPLETED_WITH_WARNINGS
            : CourseMaterialStatus.COMPLETED;

        if (dist.course_request_id) {
          await this.handleMaterialWebhookUseCase.execute({
            job_id: dist.course_request_id,
            status:
              status === CourseMaterialStatus.COMPLETED
                ? 'completed'
                : 'completed_with_warnings',
            download_url: downloadUrl,
            error_message:
              missingDesglose.length > 0
                ? missingDesglose.join(', ')
                : undefined,
          });
        }

        // Save question usages (idempotent — see handleGeneratePdf).
        if (allQuestions.length > 0) {
          await this.tenantService.runInSchema(schemaName, async (manager) => {
            await manager.delete(MaterialQuestionUsage, {
              materialRequestId: material_request_id,
              courseId,
            });
            const usages = allQuestions.map((q, idx) => {
              const u = new MaterialQuestionUsage();
              u.materialRequestId = material_request_id;
              u.cycleId = cycle_id;
              u.questionId = q.id;
              u.courseId = courseId;
              u.topicId = q.topicId;
              u.subtopicId = q.subtopicId;
              u.positionInPdf = idx + 1;
              u.wasReplacement = false;
              return u;
            });
            await manager.save(MaterialQuestionUsage, usages);
          });
        }

        return { course_id: courseId, download_url: downloadUrl, status };
      } catch (error: any) {
        this.logger.error(
          `Error generating PDF for course ${courseId}: ${error.message}`,
        );

        if (dist.course_request_id) {
          await this.handleMaterialWebhookUseCase.execute({
            job_id: dist.course_request_id,
            status: 'failed',
            error_message: error.message,
          });
        }

        throw error;
      }
    });
  }

  private async handleMergePdf(data: any) {
    const { material_request_id, tenant_id } = data;

    try {
      const schemaName = 'tenant_' + tenant_id;
      const courseRequests = await this.cls.runWith(
        { tenantSchema: schemaName } as any,
        async () => {
          return this.materialDownloadsUseCase.getCoursesForMerge(
            material_request_id,
          );
        },
      );

      const completedCourses = courseRequests.filter(
        (c: any) =>
          c.status === CourseMaterialStatus.COMPLETED && c.downloadUrl,
      );

      if (completedCourses.length < 2) return;

      const mergedPdf = await PDFDocument.create();

      for (const course of completedCourses) {
        try {
          let key = course.downloadUrl;
          if (key.startsWith('http')) {
            const urlObj = new URL(key);
            const parts = urlObj.pathname.split('/');
            key = parts.slice(2).join('/');
          }
          const pdfBuffer = await this.s3Service.getObject(key);
          const pdfDoc = await PDFDocument.load(pdfBuffer);
          const pages = await mergedPdf.copyPages(
            pdfDoc,
            pdfDoc.getPageIndices(),
          );
          pages.forEach((page) => mergedPdf.addPage(page));
        } catch (err: any) {
          this.logger.warn(
            `Skipping course ${course.courseId} for merge: ${err.message}`,
          );
        }
      }

      const mergedBuffer = Buffer.from(await mergedPdf.save());
      const mergedKey = `materials/${tenant_id}/merged/${material_request_id}/Completo.pdf`;
      const mergedUrl = await this.s3Service.uploadBuffer(
        mergedKey,
        mergedBuffer,
        'application/pdf',
      );

      await this.cls.runWith({ tenantSchema: schemaName } as any, async () => {
        await this.materialDownloadsUseCase.updateMergedDownloadUrl(
          material_request_id,
          mergedUrl,
        );
      });

      this.logger.log(`Merge complete for request ${material_request_id}`);
    } catch (error: any) {
      this.logger.error(
        `Merge failed for request ${material_request_id}: ${error.message}`,
      );
    }
  }
}
