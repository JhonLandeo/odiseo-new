import { Job } from 'bullmq';
import { PDFDocument } from 'pdf-lib';
import { PdfGenerationProcessor } from './pdf-generation.processor';
import { CourseMaterialStatus } from '../entities/material-request-course.entity';

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
}) {
  const cls = {
    // Run the callback inline; the tenant schema store is irrelevant here.
    runWith: (_store: any, fn: () => any) => fn(),
  };

  const processor = new PdfGenerationProcessor(
    undefined as any, // coreApiService
    undefined as any, // pdfGeneratorService
    overrides.s3Service as any,
    overrides.materialDownloadsUseCase as any,
    undefined as any, // handleMaterialWebhookUseCase
    cls as any,
    undefined as any, // materialsRepo
    undefined as any, // entityManager
    undefined as any, // flatQuestionsRepo
    undefined as any, // tenantService
    undefined as any, // gcsService
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
    expect(materialDownloadsUseCase.updateMergedDownloadUrl).not.toHaveBeenCalled();
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
    expect(materialDownloadsUseCase.updateMergedDownloadUrl).not.toHaveBeenCalled();
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
    expect(materialDownloadsUseCase.updateMergedDownloadUrl).toHaveBeenCalledWith(
      REQUEST_ID,
      'https://cdn/merged/Completo.pdf',
    );
  });
});
