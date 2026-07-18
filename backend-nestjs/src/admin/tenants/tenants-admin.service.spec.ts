import { ConflictException, NotFoundException } from '@nestjs/common';
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

/**
 * The method issues two statements: it looks the Super Administrators up first,
 * then updates the single one it found. `admins` seeds the lookup; `updated` is
 * the TypeORM Postgres shape for an UPDATE, `[rows, affectedCount]`.
 */
function mockQueries(
  mockManager: { query: jest.Mock },
  admins: Array<{ id: string }>,
  updated: [Array<{ id: string }>, number] = [[{ id: admins[0]?.id }], 1],
) {
  mockManager.query
    .mockResolvedValueOnce(admins)
    .mockResolvedValueOnce(updated);
}

describe('TenantsAdminService.resetAdminCredentials', () => {
  afterEach(() => jest.clearAllMocks());

  it('throws NotFoundException when the tenant does not exist', async () => {
    const { service } = createService(null);
    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws NotFoundException when the tenant has no Super Administrator', async () => {
    const { service, mockManager } = createService();
    mockQueries(mockManager, []);

    await expect(
      service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
    ).rejects.toThrow(NotFoundException);
  });

  // A2 — resetting overwrites an email and password irreversibly. With several
  // Super Administrators the previous versions picked one: first whichever the
  // planner returned, then the oldest. Both silently designate a victim the
  // operator never named. Refuse instead.
  describe('when the tenant holds more than one Super Administrator', () => {
    it('refuses with a ConflictException', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }, { id: 'user-2' }]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('names how many were found so the operator can act', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [
        { id: 'user-1' },
        { id: 'user-2' },
        { id: 'user-3' },
      ]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toThrow(/3 administradores principales/);
    });

    it('writes nothing', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }, { id: 'user-2' }]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(mockManager.query).toHaveBeenCalledTimes(1);
      expect(mockManager.query.mock.calls[0][0]).not.toMatch(/\bUPDATE\b/);
    });
  });

  describe('when the tenant holds exactly one Super Administrator', () => {
    it('targets that administrator by id', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

      const [sql, params] = mockManager.query.mock.calls[1];
      expect(sql).toMatch(/\bUPDATE\b/);
      expect(params).toContain('user-1');
    });

    // AC-016: the operator chose this password, so the administrator must
    // replace it before the account can do anything else.
    it('holds the account for a password change', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

      await service.resetAdminCredentials(TENANT_ID, 'new@test.com');

      expect(mockManager.query.mock.calls[1][0]).toMatch(
        /force_password_reset\s*=\s*true/,
      );
    });

    it('reports success and returns the generated password', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }]);

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
      mockQueries(mockManager, [{ id: 'user-1' }]);

      const result = await service.resetAdminCredentials(
        TENANT_ID,
        'new@test.com',
        'CallerChosen1!',
      );

      expect(result.temporaryPassword).toBeUndefined();
    });

    // A1 — TypeORM's Postgres driver returns [rows, affectedCount] for UPDATE,
    // so the original `rows.length === 0` check always saw 2 and never fired,
    // reporting success for a write that touched nothing.
    it('does not report success when the update affected no rows', async () => {
      const { service, mockManager } = createService();
      mockQueries(mockManager, [{ id: 'user-1' }], [[], 0]);

      await expect(
        service.resetAdminCredentials(TENANT_ID, 'new@test.com'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
