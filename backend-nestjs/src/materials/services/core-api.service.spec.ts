import { CoreApiService } from './core-api.service';
import { Cycle } from '../../academic-time/entities/cycle.entity';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';

describe('CoreApiService', () => {
  function buildService(overrides: { cycle?: any } = {}) {
    const questionBankService = {
      getRandomQuestions: jest
        .fn()
        .mockResolvedValue([{ id: 'q1', topicId: 't-1', subtopicId: 's-1' }]),
    };
    const flatQuestionsRepo = {
      findByIds: jest.fn().mockResolvedValue([
        {
          question_id: 'q1',
          code: 'C1',
          html_content: '<p>1</p>',
          alternatives: [],
          origins: { 'uni-1': 'UNMSM 2020-I' },
        },
      ]),
    };
    const gcsService = { getSignedUrl: jest.fn() };
    const schemaManager = {
      findOne: jest.fn(async (entity: any) =>
        entity === Cycle ? (overrides.cycle ?? null) : null,
      ),
    };
    const tenantService = {
      runInSchema: jest.fn(async (_schema: string, op: (m: any) => any) =>
        op(schemaManager),
      ),
    };

    const service = new CoreApiService(
      questionBankService as any,
      flatQuestionsRepo as any,
      gcsService as any,
      tenantService as any,
    );
    jest
      .spyOn((service as any).logger, 'log')
      .mockImplementation(() => undefined);

    return { service, tenantService, schemaManager };
  }

  it('reads the Cycle through the tenant schema so textOrigin resolves', async () => {
    const { service, tenantService } = buildService({
      cycle: { id: 'cycle-1', universityId: 'uni-1' },
    });

    const result = await service.fetchQuestions(
      't-1',
      's-1',
      1,
      [],
      TENANT_ID,
      'cycle-1',
    );

    // Cycle is a tenant-schema table: the read must go through runInSchema
    // for this tenant, never the default (public-only) EntityManager.
    expect(tenantService.runInSchema).toHaveBeenCalledTimes(1);
    expect(tenantService.runInSchema.mock.calls[0][0]).toBe(
      'tenant_' + TENANT_ID,
    );
    expect(result).toHaveLength(1);
    expect(result[0].textOrigin).toBe('UNMSM 2020-I');
  });

  it('skips the cycle lookup and degrades textOrigin when no cycle id is given', async () => {
    const { service, tenantService } = buildService();

    const result = await service.fetchQuestions('t-1', 's-1', 1, [], TENANT_ID);

    expect(tenantService.runInSchema).not.toHaveBeenCalled();
    expect(result[0].textOrigin).toBe('Desconocido');
  });
});
