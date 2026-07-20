import { Logger } from '@nestjs/common';
import { TenantProvisioningProcessor } from './tenant-provisioning.processor';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = `tenant_${COMPANY_ID}`;

function createProcessor(overrides?: {
  createTenantSchema?: jest.Mock;
  seedTenantSchema?: jest.Mock;
}) {
  const calls: string[] = [];
  const track =
    <T>(name: string, value?: T) =>
    async () => {
      calls.push(name);
      return value;
    };

  const schemaService = {
    createTenantSchema:
      overrides?.createTenantSchema ?? jest.fn(track('createSchema')),
    seedTenantSchema: overrides?.seedTenantSchema ?? jest.fn(track('seed')),
  };
  const companyRepository = {
    update: jest.fn(async (_id: string, patch: Record<string, unknown>) => {
      calls.push(`update:${JSON.stringify(patch)}`);
    }),
    findOne: jest
      .fn()
      .mockResolvedValue({ id: COMPANY_ID, subdomain: 'colegio' }),
  };
  const tenantsService = {
    invalidateSubdomainCache: jest.fn(async () => {
      calls.push('invalidateCache');
    }),
  };

  const processor = new TenantProvisioningProcessor(
    schemaService as any,
    companyRepository as any,
    tenantsService as any,
  );
  return {
    processor,
    calls,
    schemaService,
    companyRepository,
    tenantsService,
  };
}

function makeJob(overrides?: { attemptsMade?: number; attempts?: number }) {
  return {
    id: 'job-1',
    name: 'provision',
    data: { schemaName: SCHEMA, companyId: COMPANY_ID },
    attemptsMade: overrides?.attemptsMade ?? 0,
    opts: { attempts: overrides?.attempts ?? 3 },
  } as any;
}

// The company row is created with isActive: false and findBySubdomain filters
// on isActive, so this processor is the only path that makes a tenant
// serviceable. Activation ordering is the contract under test: flipping
// isActive before the schema exists would reopen the window where
// TenantMiddleware routes requests to a schema-less company.
describe('TenantProvisioningProcessor.process', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('activates the company only after the schema is created AND seeded', async () => {
    const { processor, calls } = createProcessor();

    await processor.process(makeJob());

    expect(calls).toEqual([
      'createSchema',
      'seed',
      'update:{"isActive":true}',
      'invalidateCache',
    ]);
  });

  // Retries exist specifically so a transient failure does not permanently
  // strand the company: the first failed attempt must rethrow for BullMQ to
  // retry, NOT immediately suspend the company (that was the old listener's
  // bug — it would suspend a tenant that was about to succeed on retry 2).
  it('rethrows a transient schema-creation failure instead of suspending the company', async () => {
    const { processor, companyRepository } = createProcessor({
      createTenantSchema: jest.fn().mockRejectedValue(new Error('disk full')),
    });

    await expect(processor.process(makeJob())).rejects.toThrow('disk full');
    expect(companyRepository.update).not.toHaveBeenCalled();
  });

  it('rethrows a transient seeding failure instead of suspending the company', async () => {
    const { processor, companyRepository } = createProcessor({
      seedTenantSchema: jest.fn().mockRejectedValue(new Error('seed broke')),
    });

    await expect(processor.process(makeJob())).rejects.toThrow('seed broke');
    expect(companyRepository.update).not.toHaveBeenCalled();
  });
});

describe('TenantProvisioningProcessor.handleFailed', () => {
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('does not suspend the company while attempts remain', async () => {
    const { processor, companyRepository } = createProcessor();
    const job = makeJob({ attemptsMade: 1, attempts: 3 });

    await processor.handleFailed(job, new Error('transient'));

    expect(companyRepository.update).not.toHaveBeenCalled();
  });

  it('suspends the company once every configured attempt is exhausted', async () => {
    const { processor, companyRepository, tenantsService } = createProcessor();
    const job = makeJob({ attemptsMade: 3, attempts: 3 });

    await processor.handleFailed(job, new Error('permanent'));

    expect(companyRepository.update).toHaveBeenCalledWith(COMPANY_ID, {
      isActive: false,
      status: 'SUSPENDED',
    });
    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('defaults to a single attempt when the job carries no attempts option', async () => {
    const { processor, companyRepository } = createProcessor();
    const job = makeJob({ attemptsMade: 1 });
    job.opts = {};

    await processor.handleFailed(job, new Error('permanent'));

    expect(companyRepository.update).toHaveBeenCalledWith(COMPANY_ID, {
      isActive: false,
      status: 'SUSPENDED',
    });
  });

  it('does nothing when the job is undefined', async () => {
    const { processor, companyRepository } = createProcessor();

    await processor.handleFailed(undefined, new Error('permanent'));

    expect(companyRepository.update).not.toHaveBeenCalled();
  });
});
