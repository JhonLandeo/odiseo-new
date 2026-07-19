import { Job } from 'bullmq';
import { PDFDocument } from 'pdf-lib';
import { PdfGenerationProcessor } from './pdf-generation.processor';
import { HandleMaterialWebhookUseCase } from '../use-cases/handle-material-webhook.use-case';
import {
  MaterialRequestCourse,
  CourseMaterialStatus,
} from '../entities/material-request-course.entity';
import { MaterialRequest } from '../entities/material-request.entity';
import { MaterialRequestStatus } from '../entities/material-status.enum';
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
  cls?: any;
}) {
  const cls = overrides.cls ?? {
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
  function singleCourseHarness(overrides: { pdfBuffer?: Buffer } = {}) {
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
      generatePdf: jest
        .fn()
        .mockResolvedValue(overrides.pdfBuffer ?? Buffer.from('pdf')),
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

  describe('billing artifact metadata (spec 008 FR-007)', () => {
    it('threads the real page count and byte size of the student PDF into the webhook call', async () => {
      const pdf = await makePdfBuffer(); // pdf-lib default: 1 page
      const { processor, handleMaterialWebhookUseCase } = singleCourseHarness({
        pdfBuffer: pdf,
      });

      await processor.process(generateJob());

      expect(handleMaterialWebhookUseCase.execute).toHaveBeenCalledTimes(1);
      const [, , artifactMeta] =
        handleMaterialWebhookUseCase.execute.mock.calls[0];
      expect(artifactMeta).toEqual({
        pageCount: 1,
        fileSizeBytes: pdf.length,
      });
    });

    it('degrades to file size only (no pageCount) when the buffer cannot be parsed as a PDF, without failing the job', async () => {
      // Default harness buffer (Buffer.from('pdf')) is not a real PDF —
      // pdf-lib cannot parse it. Extraction must degrade, not throw.
      const { processor, handleMaterialWebhookUseCase } = singleCourseHarness();

      await expect(processor.process(generateJob())).resolves.toBeDefined();

      const [, , artifactMeta] =
        handleMaterialWebhookUseCase.execute.mock.calls[0];
      expect(artifactMeta).toEqual({
        fileSizeBytes: Buffer.from('pdf').length,
      });
      expect(artifactMeta.pageCount).toBeUndefined();
    });
  });
});

describe('PdfGenerationProcessor in-process merge dispatch (companyId in CLS)', () => {
  /**
   * Integration harness: the processor runs against the REAL
   * HandleMaterialWebhookUseCase, sharing one CLS fake. The webhook use case
   * guards the merge-pdf dispatch on cls.get('companyId'); the processor's
   * cls.runWith must therefore set companyId alongside tenantSchema or every
   * in-process completion silently skips the merge.
   */
  function inProcessHarness(courseIds: string[]) {
    // Stack-based CLS: runWith pushes a store, get reads the innermost one.
    const stores: any[] = [];
    const cls = {
      runWith: async (store: any, fn: () => any) => {
        stores.push(store);
        try {
          return await fn();
        } finally {
          stores.pop();
        }
      },
      get: (key?: string) => {
        const top = stores[stores.length - 1] ?? {};
        return key === undefined ? top : top[key];
      },
    };

    // Tenant-schema state the webhook use case transitions per callback.
    const state = {
      courses: new Map(
        courseIds.map((courseId, idx) => [
          `course-req-${idx + 1}`,
          {
            id: `course-req-${idx + 1}`,
            courseId,
            materialRequestId: REQUEST_ID,
            status: CourseMaterialStatus.PROCESSING,
          },
        ]),
      ),
      parent: {
        id: REQUEST_ID,
        status: MaterialRequestStatus.PROCESSING,
        cycleId: 'cycle-1',
        weekNumber: 3,
        materialId: null as string | null,
      },
    };
    const insertBuilder: any = {
      insert: jest.fn(() => insertBuilder),
      into: jest.fn(() => insertBuilder),
      values: jest.fn(() => insertBuilder),
      orIgnore: jest.fn(() => insertBuilder),
      execute: jest.fn().mockResolvedValue({}),
    };
    const webhookManager = {
      findOne: jest.fn(async (entity: any, options: any) => {
        if (entity === MaterialRequestCourse) {
          return state.courses.get(options.where.id) ?? null;
        }
        if (entity === MaterialRequest) {
          return state.parent.id === options.where.id ? state.parent : null;
        }
        return null;
      }),
      find: jest.fn(async (entity: any, options: any) => {
        if (entity === MaterialRequestCourse) {
          return [...state.courses.values()].filter(
            (c) => c.materialRequestId === options.where.materialRequestId,
          );
        }
        return [];
      }),
      update: jest.fn(async (entity: any, id: any, patch: any) => {
        if (entity === MaterialRequestCourse) {
          const c = state.courses.get(id);
          if (c) Object.assign(c, patch);
        } else if (entity === MaterialRequest) {
          if (state.parent.id === id) Object.assign(state.parent, patch);
        }
        return { affected: 1 };
      }),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: jest.fn(() => insertBuilder),
      query: jest.fn().mockResolvedValue(undefined),
    };

    const queue = { add: jest.fn().mockResolvedValue(undefined) };
    const webhookUseCase = new HandleMaterialWebhookUseCase(
      { runInTenant: jest.fn(async (cb: any) => cb(webhookManager)) } as any,
      cls as any,
      queue as any,
      { emit: jest.fn() } as any,
    );
    jest
      .spyOn((webhookUseCase as any).logger, 'log')
      .mockImplementation(() => undefined);
    jest
      .spyOn((webhookUseCase as any).logger, 'warn')
      .mockImplementation(() => undefined);

    // Curated review data the processor loads per course.
    const queryBuilder: any = {
      innerJoin: jest.fn(() => queryBuilder),
      where: jest.fn(() => queryBuilder),
      andWhere: jest.fn(() => queryBuilder),
      orderBy: jest.fn(() => queryBuilder),
      getMany: jest.fn().mockResolvedValue([
        {
          questionId: 'q1',
          topicId: 't1',
          subtopicId: 's1',
          position: 1,
          status: ReviewQuestionStatus.FOUND,
        },
      ]),
    };
    const schemaManager = {
      createQueryBuilder: jest.fn(() => queryBuilder),
      findOne: jest.fn().mockResolvedValue({ universityId: null }),
    };

    const processor = buildProcessor({
      cls,
      s3Service: {
        uploadBuffer: jest.fn().mockResolvedValue('https://cdn/material.pdf'),
      },
      pdfGeneratorService: {
        generatePdf: jest.fn().mockResolvedValue(Buffer.from('pdf')),
      },
      handleMaterialWebhookUseCase: webhookUseCase,
      flatQuestionsRepo: {
        findByIds: jest
          .fn()
          .mockResolvedValue([
            { question_id: 'q1', code: 'C1', html_content: '<p>1</p>' },
          ]),
      },
      tenantService: {
        runInSchema: jest.fn(async (_schema: string, op: (m: any) => any) =>
          op(schemaManager),
        ),
      },
      gcsService: {},
    });

    return { processor, queue, state };
  }

  it('dispatches merge-pdf exactly once when a multi-course request completes in-process', async () => {
    const { processor, queue } = inProcessHarness(['course-1', 'course-2']);

    const job = {
      id: 'job-3',
      name: 'generate-pdf',
      data: {
        tenant_id: TENANT_ID,
        cycle_id: 'cycle-1',
        material_request_id: REQUEST_ID,
        week_number: 3,
        template_name: 'Balotario',
        distributions: [
          {
            course_id: 'course-1',
            topics: [],
            exclude_question_ids: [],
            course_request_id: 'course-req-1',
          },
          {
            course_id: 'course-2',
            topics: [],
            exclude_question_ids: [],
            course_request_id: 'course-req-2',
          },
        ],
      },
    } as unknown as Job<any, any, string>;

    await processor.process(job);

    const mergeCalls = queue.add.mock.calls.filter(
      ([name]: any[]) => name === 'merge-pdf',
    );
    expect(mergeCalls).toHaveLength(1);
    // The dispatched job carries the tenant id the processor put in CLS.
    expect(mergeCalls[0][1]).toEqual({
      material_request_id: REQUEST_ID,
      tenant_id: TENANT_ID,
    });
  });

  it('dispatches no merge job for a single-course completion', async () => {
    const { processor, queue } = inProcessHarness(['course-1']);

    const job = {
      id: 'job-4',
      name: 'generate',
      data: {
        tenant_id: TENANT_ID,
        cycle_id: 'cycle-1',
        material_request_id: REQUEST_ID,
        week_number: 3,
        template_name: 'Balotario',
        distributions: [
          {
            course_id: 'course-1',
            topics: [],
            exclude_question_ids: [],
            course_request_id: 'course-req-1',
          },
        ],
      },
    } as unknown as Job<any, any, string>;

    await processor.process(job);

    expect(queue.add).not.toHaveBeenCalled();
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
    // Courses expose no key/solution PDFs, so only the student variant is
    // uploaded and the other two URLs are recorded as absent.
    expect(s3Service.uploadBuffer).toHaveBeenCalledTimes(1);
    expect(
      materialDownloadsUseCase.updateMergedDownloadUrl,
    ).toHaveBeenCalledWith(
      REQUEST_ID,
      'https://cdn/merged/Completo.pdf',
      undefined,
      undefined,
    );
  });

  it('merges the keys and solutions variants and records all three urls', async () => {
    const pdf = await makePdfBuffer();
    const materialDownloadsUseCase = {
      getCoursesForMerge: jest.fn().mockResolvedValue([
        {
          courseId: 'c1',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c1.pdf',
          keyDownloadUrl: 'materials/x/c1_keys.pdf',
          solutionDownloadUrl: 'materials/x/c1_solutions.pdf',
        },
        {
          courseId: 'c2',
          status: CourseMaterialStatus.COMPLETED,
          downloadUrl: 'materials/x/c2.pdf',
          keyDownloadUrl: 'materials/x/c2_keys.pdf',
          solutionDownloadUrl: 'materials/x/c2_solutions.pdf',
        },
      ]),
      updateMergedDownloadUrl: jest.fn().mockResolvedValue(undefined),
    };
    const s3Service = {
      getObject: jest.fn().mockResolvedValue(pdf),
      uploadBuffer: jest
        .fn()
        .mockImplementation((key: string) =>
          Promise.resolve(`https://cdn/${key}`),
        ),
    };
    const processor = buildProcessor({ s3Service, materialDownloadsUseCase });

    await expect(processor.process(mergeJob())).resolves.not.toThrow();
    // One combined PDF per variant: student, keys, solutions.
    expect(s3Service.uploadBuffer).toHaveBeenCalledTimes(3);
    const uploadedKeys = s3Service.uploadBuffer.mock.calls.map(
      ([key]: any[]) => key,
    );
    expect(uploadedKeys).toEqual([
      expect.stringContaining('/Completo.pdf'),
      expect.stringContaining('/Completo_keys.pdf'),
      expect.stringContaining('/Completo_solutions.pdf'),
    ]);
    expect(
      materialDownloadsUseCase.updateMergedDownloadUrl,
    ).toHaveBeenCalledWith(
      REQUEST_ID,
      expect.stringContaining('/Completo.pdf'),
      expect.stringContaining('/Completo_keys.pdf'),
      expect.stringContaining('/Completo_solutions.pdf'),
    );
  });
});
