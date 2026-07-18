import { NotFoundException } from '@nestjs/common';
import { TenantsAdminService } from './tenants-admin.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';

function createService(company: any = { id: TENANT_ID }) {
  const mockManager = { query: jest.fn() };
  const companyRepository = {
    findOne: jest.fn().mockResolvedValue(company),
    manager: mockManager,
  };
  const eventEmitter = { emit: jest.fn() };
  const tenantService = {
    runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
      op(mockManager),
    ),
  };
  const service = new TenantsAdminService(
    companyRepository as any,
    eventEmitter as any,
    tenantService as any,
  );
  return { service, mockManager, companyRepository, tenantService };
}

describe('TenantsAdminService.resetAdminCredentials', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the tenant does not exist', async () => {
    const { service } = createService(null);
    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  // A1 — the driver returns [rows, affectedCount] for UPDATE, so the previous
  // `rows.length === 0` check always saw 2 and never fired.
  it('throws NotFoundException when the tenant has no Super Administrator', async () => {
    const { service, mockManager } = createService();
    // TypeORM Postgres shape for an UPDATE that matched nothing.
    mockManager.query.mockResolvedValue([[], 0]);

    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('does not report success when zero rows were affected', async () => {
    const { service, mockManager } = createService();
    mockManager.query.mockResolvedValue([[], 0]);

    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com', 'Secret123!'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('reports success and returns the generated password when one row was updated', async () => {
    const { service, mockManager } = createService();
    mockManager.query.mockResolvedValue([[{ id: 'user-1' }], 1]);

    const result = await service.resetAdminCredentials(
      TENANT_ID,
      'new@test.com',
    );

    expect(result.success).toBe(true);
    expect(result.newEmail).toBe('new@test.com');
    expect(result.temporaryPassword).toEqual(expect.any(String));
  });

  it('omits the temporary password when the caller supplied one', async () => {
    const { service, mockManager } = createService();
    mockManager.query.mockResolvedValue([[{ id: 'user-1' }], 1]);

    const result = await service.resetAdminCredentials(
      TENANT_ID,
      'new@test.com',
      'CallerChosen1!',
    );

    expect(result.temporaryPassword).toBeUndefined();
  });

  // A2 — with several Super Administrators the planner used to decide which
  // account lost its credentials.
  it('selects the admin deterministically (oldest first)', async () => {
    const { service, mockManager } = createService();
    mockManager.query.mockResolvedValue([[{ id: 'user-1' }], 1]);

    await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

    const sql: string = mockManager.query.mock.calls[0][0];
    expect(sql).toMatch(/ORDER BY\s+u\.created_at ASC, u\.id ASC/);
    expect(sql).toContain('LIMIT 1');
  });
});
