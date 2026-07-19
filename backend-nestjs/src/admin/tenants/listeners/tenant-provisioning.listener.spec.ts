import { Logger } from '@nestjs/common';
import { TenantProvisioningListener } from './tenant-provisioning.listener';
import { TenantProvisioningEvent } from '../events/tenant-provisioning.event';

const COMPANY_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = `tenant_${COMPANY_ID}`;

function createListener(overrides?: {
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

  const listener = new TenantProvisioningListener(
    schemaService as any,
    companyRepository as any,
    tenantsService as any,
  );
  return { listener, calls, schemaService, companyRepository, tenantsService };
}

// The company row is created with isActive: false and findBySubdomain filters
// on isActive, so this listener is the only path that makes a tenant
// serviceable. Activation ordering is the contract under test: flipping
// isActive before the schema exists would reopen the window where
// TenantMiddleware routes requests to a schema-less company.
describe('TenantProvisioningListener', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('activates the company only after the schema is created AND seeded', async () => {
    const { listener, calls } = createListener();

    await listener.handleTenantProvisioningEvent(
      new TenantProvisioningEvent(SCHEMA, COMPANY_ID),
    );

    expect(calls).toEqual([
      'createSchema',
      'seed',
      'update:{"isActive":true}',
      'invalidateCache',
    ]);
  });

  it('does not activate the company when schema creation fails', async () => {
    const { listener, companyRepository } = createListener({
      createTenantSchema: jest.fn().mockRejectedValue(new Error('disk full')),
    });

    await listener.handleTenantProvisioningEvent(
      new TenantProvisioningEvent(SCHEMA, COMPANY_ID),
    );

    expect(companyRepository.update).toHaveBeenCalledTimes(1);
    expect(companyRepository.update).toHaveBeenCalledWith(COMPANY_ID, {
      isActive: false,
      status: 'SUSPENDED',
    });
  });

  it('suspends the company when seeding fails after the schema exists', async () => {
    const { listener, companyRepository } = createListener({
      seedTenantSchema: jest.fn().mockRejectedValue(new Error('seed broke')),
    });

    await listener.handleTenantProvisioningEvent(
      new TenantProvisioningEvent(SCHEMA, COMPANY_ID),
    );

    expect(companyRepository.update).toHaveBeenCalledWith(COMPANY_ID, {
      isActive: false,
      status: 'SUSPENDED',
    });
  });

  it('invalidates the subdomain lookup cache after a failed provisioning too', async () => {
    const { listener, tenantsService } = createListener({
      createTenantSchema: jest.fn().mockRejectedValue(new Error('disk full')),
    });

    await listener.handleTenantProvisioningEvent(
      new TenantProvisioningEvent(SCHEMA, COMPANY_ID),
    );

    expect(tenantsService.invalidateSubdomainCache).toHaveBeenCalledWith(
      'colegio',
    );
  });

  it('does not suspend a provisioned company when only the cache invalidation fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { listener, companyRepository, tenantsService } = createListener();
    tenantsService.invalidateSubdomainCache.mockRejectedValue(
      new Error('Redis down'),
    );

    await listener.handleTenantProvisioningEvent(
      new TenantProvisioningEvent(SCHEMA, COMPANY_ID),
    );

    expect(companyRepository.update).toHaveBeenCalledTimes(1);
    expect(companyRepository.update).toHaveBeenCalledWith(COMPANY_ID, {
      isActive: true,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
