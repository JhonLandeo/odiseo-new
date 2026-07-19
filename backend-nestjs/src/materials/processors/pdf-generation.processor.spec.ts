import { Job } from 'bullmq';
import { PDFDocument } from 'pdf-lib';
import { PdfGenerationProcessor } from './pdf-generation.processor';
import { CourseMaterialStatus } from '../entities/material-request-course.entity';
import { ReviewQuestionStatus } from '../entities/material-review-question.entity';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const REQUEST_ID = 'req-merge-1';

/**
 * Builds a real one-page PDF so the merge path (PDFDocument.load + copyPages +
 * save) exercises pdf-lib for real rather than against a fabricated buffer.
 */
async function makePdfBuffer(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return Buffer.from(await doc.save());
}

function buildProcessor(overrides: {
  s3Service?: any;
  materialDownloadsUseCase?: any;
  pdfGeneratorService?: any;
  handleMaterialWebhookUseCase?: any;
  flatQuestionsRepo?: any;
  tenantService?: any;
  gcsService?: any;
}) {
  const cls = {
    // Run the callback inline; the tenant schema store is irrelevant here.
    runWith: (_store: any, fn: () => any) => fn(),
  };

  const processor = new PdfGenerationProcessor(
    undefined as any, // coreApiService
    overrides.pdfGeneratorService as any,
    overrides.s3Service as any,
    overrides.materialDownloadsUseCase as any,
    overrides.handleMaterialWebhookUseCase as any,
    cls as any,
    undefined as any, // materialsRepo
    undefined as any, // entityManager
    overrides.flatQuestionsRepo as any,
    overrides.tenantService as any,
    overrides.gcsService as any,
  );

  // Silence the logger so a failing-path test does not print noise.
  jest
    .spyOn((processor as any).logger, 'error')
    .mockImplementation(() => undefined);
  jest
    .spyOn((processor as any).logger, 'log')
    .mockImplementation(() => undefined);
  jest
    .spyOn((processor as any).logger, 'warn')
    .mockImplementation(() => undefined);

  return processor;
}

function mergeJob(): Job<any, any, string> {
  return {
    id: 'job-1',
    name: 'merge-pdf',
    data: { material_request_id: REQUEST_ID, tenant_id: TENANT_ID },
  } as unknown as Job<any, any, string>;
}

describe('PdfGenerationProcessor generate (single course)', () => {
  /**
   * Curated review questions for one course: q1 kept as selected (FOUND) and
   * q2 swapped in by an admin during curation (REPLACED). The processor must
   * hand the usage records to the webhook use case — which persists them
   * atomically with the completion status — instead of writing them in its
   * own separate transaction, and must flag the replaced question.
   */
  function singleCourseHarness() {
    const reviewQuestions = [
      {
        questionId: 'q1',
        topicId: 't1',
        subtopicId: 's1',
        position: 1,
        status: ReviewQuestionStatus.FOUND,
      },
      {
        questionId: 'q2',
        topicId: 't1',
        subtopicId: 's2',
        position: 2,
        status: ReviewQuestionStatus.REPLACED,
      },
    ];

    const queryBuilder: any = {
      innerJoin: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      orderBy: jest.fn(() => queryBuilder),
      getMany: jest.fn().mockResolvedValue(reviewQuestions),
    };
    const schemaManager = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOne: jest.fn().mockResolvedValue({ universityId: null }),
    };
    const tenantService = {
      runInSchema: jest.fn(async (_schema: string, op: (m: any) => any) =>
        op(schemaManager),
      ),
    };
    const flatQuestionsRepo = {
      findByIds: jest.fn().mockResolvedValue([
        { question_id: 'q1', code: 'C1', html_content: '<p>1</p>' },
        { question_id: 'q2', code: 'C2', html_content: '<p>2</p>' },
      ]),
    };
    const pdfGeneratorService = {
      generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
    };
    const s3Service = {
      uploadBuffer: jest.fn().mockResolvedValue('https://cdn/material.pdf'),
    };
    const handleMaterialWebhookUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    };

    const processor = buildProcessor({
      s3Service,
      pdfGeneratorService,
      handleMaterialWebhookUseCase,
      flatQuestionsRepo,
      tenantService,
      gcsService: {},
    });

    return { processor, handleMaterialWebhookUseCase, tenantService };
  }

  function generateJob(): Job<any, any, string> {
    return {
      id: 'job-2',
      name: 'generate',
      data: {
        tenant_id: TENANT_ID,
        cycle_id: 'cycle-1',
        material_request_id: REQUEST_ID,
        week_number: 3,
        template_name: 'Balotario',
        distributions: [
          {
            course_id: 'course-9',
            topics: [],
            exclude_question_ids: [],
            course_request_id: 'course-req-1',
          },
        ],
      },
    } as unknown as Job<any, any, string>;
  }

  it('hands the usage records to the webhook use case with was_replacement flagged', async () => {
    const { processor, handleMaterialWebhookUseCase } = singleCourseHarness();

    await processor.process(generateJob());

    expect(handleMaterialWebhookUseCase.execute).toHaveBeenCalledTimes(1);
    const [statusData, usages] =
      handleMaterialWebhookUseCase.execute.mock.calls[0];
    expect(statusData).toEqual(
      expect.objectContaining({
        job_id: 'course-req-1',
        status: 'completed',
        download_url: 'https://cdn/material.pdf',
      }),
    );
    expect(usages).toEqual([
      expect.objectContaining({
        cycleId: 'cycle-1',
        questionId: 'q1',
        positionInPdf: 1,
        wasReplacement: false,
      }),
      expect.objectContaining({
        cycleId: 'cycle-1',
        questionId: 'q2',
        positionInPdf: 2,
        wasReplacement: true,
      }),
    ]);
  });

  it('opens no separate transaction to write the usage ledger itself', async () => {
    const { processor, tenantService } = singleCourseHarness();

    await processor.process(generateJob());

    // runInSchema is used only to READ curation data (review questions, then
    // the cycle); a third call was the old separate ledger-write transaction,
    // which now belongs to the webhook use case's own transaction.
    expect(tenantService.runInSchema).toHaveBeenCalledTimes(2);
  });
});

describe('PdfGenerationProcessor merge-pdf', () => {
  it('rethrows when the merge fails so BullMQ retries the job', async () => {
    const materialDownloadsUseCase = {
      // Fail while fetching the courses to merge — a merge dependency throwing.
      getCoursesForMerge: jest
        .fn()
        .mockRejectedValue(new Error('db unavailable')),
      updateMergedDownloadUrl: jest.fn(),
    };
    const processor = buildProcessor({
      s3Service: {},
      materialDownloadsUseCase,
    });

    await expect(processor.process(mergeJob())).rejects.toThrow(
      'db unavailable',
    );
    expect(
      materialDownloadsUseCase.updateMergedDownloadUrl,
    ).not.toHaveBeenCalled();
  });

  it('rethrows when the merged upload fails', async () => {
    const pdf = await makePdfBuffer();
    const materialDownloadsUseCase = {
      getCoursesForMerge: jest.fn().mockResolvedValue([
        {
          courseId: 'c1',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c1.pdf',
        },
        {
          courseId: 'c2',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c2.pdf',
        },
      ]),
      updateMergedDownloadUrl: jest.fn(),
    };
    const s3Service = {
      getObject: jest.fn().mockResolvedValue(pdf),
      uploadBuffer: jest.fn().mockRejectedValue(new Error('s3 down')),
    };
    const processor = buildProcessor({ s3Service, materialDownloadsUseCase });

    await expect(processor.process(mergeJob())).rejects.toThrow('s3 down');
    expect(
      materialDownloadsUseCase.updateMergedDownloadUrl,
    ).not.toHaveBeenCalled();
  });

  it('resolves and records the merged url on success (happy path intact)', async () => {
    const pdf = await makePdfBuffer();
    const materialDownloadsUseCase = {
      getCoursesForMerge: jest.fn().mockResolvedValue([
        {
          courseId: 'c1',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c1.pdf',
        },
        {
          courseId: 'c2',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c2.pdf',
        },
      ]),
      updateMergedDownloadUrl: jest.fn().mockResolvedValue(undefined),
    };
    const s3Service = {
      getObject: jest.fn().mockResolvedValue(pdf),
      uploadBuffer: jest
        .fn()
        .mockResolvedValue('https://cdn/merged/Completo.pdf'),
    };
    const processor = buildProcessor({ s3Service, materialDownloadsUseCase });

    await expect(processor.process(mergeJob())).resolves.not.toThrow();
    expect(s3Service.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(
      materialDownloadsUseCase.updateMergedDownloadUrl,
    ).toHaveBeenCalledWith(REQUEST_ID, 'https://cdn/merged/Completo.pdf');
  });
});
