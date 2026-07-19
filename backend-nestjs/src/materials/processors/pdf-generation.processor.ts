import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
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
import {
  HandleMaterialWebhookUseCase,
  QuestionUsageRecord,
  PdfArtifactMeta,
} from '../use-cases/handle-material-webhook.use-case';
import { ClsService } from 'nestjs-cls';
import { CourseMaterialStatus } from '../entities/material-request-course.entity';
import { PdfDesignTemplate } from '../entities/pdf-design-template.entity';
import { PDFDocument } from 'pdf-lib';
import {
  MaterialReviewQuestion,
  ReviewQuestionStatus,
} from '../entities/material-review-question.entity';
import { Topic } from '../../catalogs/entities/topic.entity';
import { TenantService } from '../../database/tenant.service';
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

  /**
   * Loads the questions for one course of a material request: curated review
   * questions (MaterialReviewQuestion joined to Topic for the course filter)
   * when curation happened, otherwise random questions from the bank per
   * syllabus topic. Shared by the multi-course and single-course job handlers
   * so both produce identical questions, warnings and REPLACED flags.
   */
  private async loadCourseQuestions(params: {
    schemaName: string;
    tenantId: string;
    cycleId: string;
    materialRequestId: string;
    dist: any;
    logContext: string;
  }): Promise<{
    allQuestions: ExtractedQuestion[];
    missingDesglose: string[];
    replacedQuestionIds: Set<string>;
  }> {
    const { schemaName, tenantId, cycleId, materialRequestId, dist } = params;
    const courseId = dist.course_id;
    let allQuestions: ExtractedQuestion[] = [];
    const missingDesglose: string[] = [];
    // Question ids the curation flow swapped in (MaterialReviewQuestion
    // status REPLACED); their usage rows are flagged was_replacement.
    const replacedQuestionIds = new Set<string>();

    // Try to load curated review questions first
    let reviewQuestions: MaterialReviewQuestion[] = [];
    await this.tenantService.runInSchema(schemaName, async (manager) => {
      reviewQuestions = await manager
        .createQueryBuilder(MaterialReviewQuestion, 'mrq')
        .innerJoin(Topic, 't', 't.id = mrq.topic_id')
        .where('mrq.material_request_id = :materialRequestId', {
          materialRequestId,
        })
        .andWhere('t.course_id = :courseId', { courseId })
        .orderBy('mrq.position', 'ASC')
        .getMany();
    });

    if (reviewQuestions.length > 0) {
      this.logger.log(
        `Found ${reviewQuestions.length} review questions in DB for ${params.logContext} ${materialRequestId} course ${courseId}`,
      );

      const questionIds = reviewQuestions
        .map((q) => q.questionId)
        .filter((id): id is string => !!id);

      let questionMap = new Map<string, any>();
      if (questionIds.length > 0) {
        const dbQuestions = await this.flatQuestionsRepo.findByIds(questionIds);
        questionMap = new Map(
          dbQuestions.map((q: any) => [String(q.question_id), q]),
        );
      }

      let universityId: string | undefined | null;
      await this.tenantService.runInSchema(schemaName, async (manager) => {
        const cycle = await manager.findOne(Cycle, {
          where: { id: cycleId },
        });
        universityId = cycle?.universityId;
      });

      for (const mrq of reviewQuestions) {
        if (mrq.status === ReviewQuestionStatus.EMPTY) {
          missingDesglose.push(`Falta pregunta de subtema ${mrq.subtopicId}`);
        } else if (mrq.status === ReviewQuestionStatus.REMOVED) {
          missingDesglose.push(
            `Pregunta descartada en subtema ${mrq.subtopicId}`,
          );
        } else {
          if (mrq.questionId) {
            const q = questionMap.get(mrq.questionId);
            if (q) {
              // A signing failure throws and is deliberately left to reach
              // the calling handler's per-course `catch`, which reports the
              // course as `failed` and fails the job. Swallowing it would
              // put an empty `src` in the PDF, shipping an exam with missing
              // images under a `completed` status.
              const signedImages = await Promise.all(
                (q.images || []).map(async (img: any) => ({
                  id: img.id,
                  url: await this.gcsService.getSignedUrl(img.gcs_key),
                })),
              );

              const signedDiagImages = await Promise.all(
                (q.solution?.diagrammed_images || []).map(async (img: any) => ({
                  id: img.id,
                  url: await this.gcsService.getSignedUrl(img.gcs_key),
                })),
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
              if (mrq.status === ReviewQuestionStatus.REPLACED) {
                replacedQuestionIds.add(String(q.question_id));
              }
            } else {
              missingDesglose.push(
                `Falta reactivo con ID ${mrq.questionId} en posición ${mrq.position}`,
              );
            }
          } else {
            missingDesglose.push(`Falta pregunta de subtema ${mrq.subtopicId}`);
          }
        }
      }
    } else {
      // Fallback: fetch random questions from mock/bank
      for (const topic of dist.topics || []) {
        const qs = await this.coreApiService.fetchQuestions(
          topic.topic_id,
          topic.subtopic_id,
          topic.quantity,
          dist.exclude_question_ids,
          tenantId,
          cycleId,
        );
        allQuestions = allQuestions.concat(qs);
        if (qs.length < topic.quantity) {
          missingDesglose.push(
            `Faltan ${topic.quantity - qs.length} de subtema ${topic.subtopic_id}`,
          );
        }
      }
    }

    return { allQuestions, missingDesglose, replacedQuestionIds };
  }

  /**
   * Billing artifact metadata (spec 008 FR-007) for the STUDENT PDF Buffer —
   * the primary artifact; keys/solutions page counts are out of scope. Reads
   * straight off the Buffer already in memory (no S3 re-read, no separate
   * scan): `buffer.length` for the byte size, and `pdf-lib` for the real page
   * count.
   *
   * Page-count extraction is best-effort: a corrupt/unparseable buffer must
   * NOT fail an otherwise-successful course generation over a billing
   * side-metric. On failure this logs a warning and omits pageCount, so the
   * webhook use case leaves the column NULL (the collector cron's
   * COALESCE(SUM(page_count), 0) already treats that as 0).
   */
  private async extractPdfArtifactMeta(
    pdfBuffer: Buffer,
    logContext: string,
  ): Promise<PdfArtifactMeta> {
    const fileSizeBytes = pdfBuffer.length;
    try {
      const doc = await PDFDocument.load(pdfBuffer);
      return { pageCount: doc.getPageCount(), fileSizeBytes };
    } catch (err: any) {
      this.logger.warn(
        `Could not extract page count for ${logContext}: ${err.message}`,
      );
      return { fileSizeBytes };
    }
  }

  /**
   * The anti-repetition ledger rows for one generated course, in PDF order.
   * They travel WITH the completion callback so the webhook use case commits
   * the course's terminal status and its ledger in one tenant transaction.
   */
  private buildUsageRecords(
    allQuestions: ExtractedQuestion[],
    cycleId: string,
    replacedQuestionIds: Set<string>,
  ): QuestionUsageRecord[] {
    return allQuestions.map((q, idx) => ({
      cycleId,
      questionId: q.id,
      topicId: q.topicId,
      subtopicId: q.subtopicId,
      positionInPdf: idx + 1,
      wasReplacement: replacedQuestionIds.has(q.id),
    }));
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

    // companyId must ride along with tenantSchema: the webhook use case's
    // merge-once roll-up reads cls.get('companyId') to dispatch the merge-pdf
    // job. Without it, completions arriving through this in-process path had
    // no tenant identity and the merge dispatch silently skipped.
    return this.cls.runWith(
      { tenantSchema: schemaName, companyId: tenant_id } as any,
      async () => {
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
        let processed = 0;

        for (const dist of distributions) {
          const courseId = dist.course_id;

          try {
            const { allQuestions, missingDesglose, replacedQuestionIds } =
              await this.loadCourseQuestions({
                schemaName,
                tenantId: tenant_id,
                cycleId: cycle_id,
                materialRequestId: material_request_id,
                dist,
                logContext: 'request',
              });

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
            const solutionPdfBuffer =
              await this.pdfGeneratorService.generatePdf(
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
              const artifactMeta = await this.extractPdfArtifactMeta(
                pdfBuffer,
                `course ${courseId} of request ${material_request_id}`,
              );
              await this.handleMaterialWebhookUseCase.execute(
                {
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
                },
                this.buildUsageRecords(
                  allQuestions,
                  cycle_id,
                  replacedQuestionIds,
                ),
                artifactMeta,
              );
            }

            processed++;
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

        // The combined PDF is NOT produced here. When the last course's
        // completion callback rolls the parent request up, the webhook use
        // case dispatches the 'merge-pdf' job exactly once (merge-once
        // guard); handleMergePdf is the single merge path.
        return { processed };
      },
    );
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

    // companyId: see handleGeneratePdf — required for the webhook use case's
    // merge-pdf dispatch on this in-process path.
    return this.cls.runWith(
      { tenantSchema: schemaName, companyId: tenant_id } as any,
      async () => {
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

        try {
          const { allQuestions, missingDesglose, replacedQuestionIds } =
            await this.loadCourseQuestions({
              schemaName,
              tenantId: tenant_id,
              cycleId: cycle_id,
              materialRequestId: material_request_id,
              dist,
              logContext: 'single course request',
            });

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
            const artifactMeta = await this.extractPdfArtifactMeta(
              pdfBuffer,
              `course ${courseId} of request ${material_request_id}`,
            );
            await this.handleMaterialWebhookUseCase.execute(
              {
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
              },
              this.buildUsageRecords(
                allQuestions,
                cycle_id,
                replacedQuestionIds,
              ),
              artifactMeta,
            );
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
      },
    );
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

      // This job is the ONLY merge path (the former inline merge in
      // handleGeneratePdf was removed), so it must produce every combined
      // variant the download endpoint serves: student, answer keys and
      // solutions (GET :id/download-merged?type=student|keys|solutions).
      const keyPrefix = `materials/${tenant_id}/merged/${material_request_id}`;
      const mergedUrl = await this.mergeAndUpload(
        completedCourses,
        'downloadUrl',
        `${keyPrefix}/Completo.pdf`,
      );
      if (!mergedUrl) {
        // Every per-course student PDF failed to load: uploading an empty
        // combined PDF would report success over a broken artifact. Throw so
        // BullMQ retries the merge instead.
        throw new Error('No course PDFs could be merged');
      }
      // Keys/solutions are optional per course; merge whichever exist so the
      // combined variants match what per-course generation produced.
      const mergedKeyUrl = await this.mergeAndUpload(
        completedCourses,
        'keyDownloadUrl',
        `${keyPrefix}/Completo_keys.pdf`,
      );
      const mergedSolutionUrl = await this.mergeAndUpload(
        completedCourses,
        'solutionDownloadUrl',
        `${keyPrefix}/Completo_solutions.pdf`,
      );

      await this.cls.runWith({ tenantSchema: schemaName } as any, async () => {
        await this.materialDownloadsUseCase.updateMergedDownloadUrl(
          material_request_id,
          mergedUrl,
          mergedKeyUrl ?? undefined,
          mergedSolutionUrl ?? undefined,
        );
      });

      this.logger.log(`Merge complete for request ${material_request_id}`);
    } catch (error: any) {
      this.logger.error(
        `Merge failed for request ${material_request_id}: ${error.message}`,
      );

      // Rethrow so BullMQ marks THIS merge-pdf job failed and retries it
      // (attempts: 3). merge-pdf is a separate job from the per-course
      // generation, so retrying re-runs only the merge, not the PDFs.
      //
      // We deliberately do NOT flip the material to FAILED: the per-course
      // PDFs already exist and are downloadable; only the optional combined
      // "Completo.pdf" is missing. Rethrowing keeps that failure visible in
      // the failed queue and retryable without invalidating good output.
      throw error;
    }
  }

  /**
   * Merges the PDFs referenced by `urlField` across the given course rows
   * into one document and uploads it. Returns null when no source could be
   * merged (field absent on every course, or every fetch failed) so the
   * caller can distinguish "variant not produced" from a real URL.
   */
  private async mergeAndUpload(
    courses: any[],
    urlField: string,
    s3Key: string,
  ): Promise<string | null> {
    const sources = courses.filter((c: any) => c[urlField]);
    if (sources.length === 0) return null;

    const mergedPdf = await PDFDocument.create();
    let pagesAdded = false;
    for (const course of sources) {
      try {
        let key = course[urlField];
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
        pagesAdded = true;
      } catch (err: any) {
        this.logger.warn(
          `Skipping course ${course.courseId} (${urlField}) for merge: ${err.message}`,
        );
      }
    }
    if (!pagesAdded) return null;

    const mergedBuffer = Buffer.from(await mergedPdf.save());
    return this.s3Service.uploadBuffer(s3Key, mergedBuffer, 'application/pdf');
  }
}
