import { NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { TenantAdminsService } from './tenant-admins.service';

// ────────────────────────────────────────────────────────────────────
// Mocks
// ────────────────────────────────────────────────────────────────────

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('$2b$10$hashedpassword'),
}));

const TENANT_ID = '00000000-0000-0000-0000-000000000001';
const SCHEMA = `tenant_${TENANT_ID}`;
const USER_ID = 'user-uuid-001';
const ROLE_ID = 'role-uuid-001';

const mockCompany = { id: TENANT_ID, commercialName: 'Test Corp' };

function createMockManager() {
  return { query: jest.fn() };
}

function createMockCompanyRepo(company: any = mockCompany) {
  return {
    findOne: jest.fn().mockResolvedValue(company),
  };
}

function createMockTenantService(mockManager: any) {
  return {
    runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
      op(mockManager),
    ),
  };
}

function createService(companyRepoOverride?: any, tenantServiceOverride?: any) {
  const mockManager = createMockManager();
  const companyRepo = companyRepoOverride ?? createMockCompanyRepo();
  const tenantService =
    tenantServiceOverride ?? createMockTenantService(mockManager);
  const authService = {
    revokeUserTokens: jest.fn().mockResolvedValue(undefined),
  };
  const service = new TenantAdminsService(
    companyRepo,
    tenantService,
    authService as any,
  );
  return { service, mockManager, companyRepo, tenantService, authService };
}

// ════════════════════════════════════════════════════════════════════
// TEST SUITE
// ════════════════════════════════════════════════════════════════════

describe('TenantAdminsService', () => {
  afterEach(() => jest.clearAllMocks());

  // ─────────────────────────────── validateCompanyExists ──────────
  describe('Company Validation (cross-cutting)', () => {
    it('should throw NotFoundException when company does not exist', async () => {
      const { service } = createService(createMockCompanyRepo(null));
      await expect(service.findAll('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─────────────────────────────── US-001: findAll ───────────────
  describe('US-001 — findAll (Listar administradores)', () => {
    it('AC-001: should return paginated active superadmins', async () => {
      const { service, mockManager } = createService();
      const adminRows = [
        {
          id: USER_ID,
          email: 'admin1@test.com',
          name: 'Admin 1',
          is_active: true,
        },
      ];
      mockManager.query
        .mockResolvedValueOnce(adminRows) // data query
        .mockResolvedValueOnce([{ count: '1' }]); // count query

      const result = await service.findAll(TENANT_ID, 1, 50);

      expect(result.data).toEqual(adminRows);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.last_page).toBe(1);
    });

    it('AC-002: should return empty list when no superadmins exist', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      const result = await service.findAll(TENANT_ID, 1, 50);

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('AC-003: should paginate when more admins than page size', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: 'page2-user' }])
        .mockResolvedValueOnce([{ count: '75' }]);

      const result = await service.findAll(TENANT_ID, 2, 50);

      expect(result.meta.page).toBe(2);
      expect(result.meta.last_page).toBe(2); // ceil(75/50)
      // Verify OFFSET = (2-1)*50 = 50
      const dataQuery = mockManager.query.mock.calls[0];
      expect(dataQuery[1]).toEqual([50, 50]); // [limit, offset]
    });

    it('AC-028: should default to limit=50 when not specified', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ count: '0' }]);

      await service.findAll(TENANT_ID); // defaults: page=1, limit=50

      const dataQuery = mockManager.query.mock.calls[0];
      expect(dataQuery[1]).toEqual([50, 0]); // limit=50, offset=0
    });
  });

  // ─────────────────────────────── US-002: create ────────────────
  describe('US-002 — create (Crear administrador)', () => {
    it('AC-005: should create user and assign Super Administrador role', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([]) // email check — no duplicates
        .mockResolvedValueOnce([{ id: ROLE_ID }]) // role lookup
        .mockResolvedValueOnce([
          { id: USER_ID, email: 'a@b.com', name: 'Admin', is_active: true },
        ]) // user insert
        .mockResolvedValueOnce(undefined); // role assignment

      const result = await service.create(TENANT_ID, {
        email: 'a@b.com',
        name: 'Admin',
        password: 'Temporal123!',
      });

      expect(result.id).toBe(USER_ID);
      expect(result.email).toBe('a@b.com');

      // Verify role assignment query was called
      const roleAssignCall = mockManager.query.mock.calls[3];
      expect(roleAssignCall[0]).toContain('user_roles');
      expect(roleAssignCall[1]).toEqual([USER_ID, ROLE_ID]);
    });

    // AC-016: the creating administrator knows this password, so it is not the
    // new account's password until its owner replaces it.
    it('AC-016: creates the account already held for a password change', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([]) // email check
        .mockResolvedValueOnce([{ id: ROLE_ID }]) // role lookup
        .mockResolvedValueOnce([
          { id: USER_ID, email: 'new@b.com', name: 'N', is_active: true },
        ]) // user INSERT
        .mockResolvedValueOnce(undefined); // role assignment

      await service.create(TENANT_ID, {
        email: 'new@b.com',
        name: 'N',
        password: 'Pass123!',
      });

      const userInsertSql = mockManager.query.mock.calls[2][0];
      expect(userInsertSql).toContain('force_password_reset');
      expect(userInsertSql).toMatch(/VALUES\s*\([^)]*true\s*\)/);
    });

    it('AC-007: should reject creation with duplicate email', async () => {
      const { service, mockManager } = createService();
      mockManager.query.mockResolvedValueOnce([{ id: 'existing-user' }]); // email exists

      await expect(
        service.create(TENANT_ID, {
          email: 'dup@test.com',
          name: 'Dup',
          password: 'Pass123!',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('EC-011: should create role on-demand if not exists for company', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([]) // email check
        .mockResolvedValueOnce([]) // role lookup — empty
        .mockResolvedValueOnce([{ id: 'new-role' }]) // role INSERT returning id
        .mockResolvedValueOnce([
          { id: USER_ID, email: 'new@b.com', name: 'N', is_active: true },
        ]) // user
        .mockResolvedValueOnce(undefined); // role assignment

      const result = await service.create(TENANT_ID, {
        email: 'new@b.com',
        name: 'N',
        password: 'Pass123!',
      });

      expect(result.id).toBe(USER_ID);
      // Verify role was inserted
      const roleInsertCall = mockManager.query.mock.calls[2];
      expect(roleInsertCall[0]).toContain('Super Administrador');
    });
  });

  // ─────────────────────────────── US-003: update ────────────────
  describe('US-003 — update (Editar administrador)', () => {
    it('AC-010: should update allowed fields', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }]) // admin exists check
        .mockResolvedValueOnce(undefined); // update query

      const result = await service.update(TENANT_ID, USER_ID, {
        name: 'Nuevo Nombre',
      });

      expect(result).toEqual({ success: true });
    });

    it('AC-011: should reject duplicate email on update', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }]) // admin exists
        .mockResolvedValueOnce([{ id: 'other-user' }]); // email collision

      await expect(
        service.update(TENANT_ID, USER_ID, { email: 'taken@test.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('AC-012: should return 404 for deleted admin', async () => {
      const { service, mockManager } = createService();
      mockManager.query.mockResolvedValueOnce([]); // admin not found (inactive)

      await expect(
        service.update(TENANT_ID, USER_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─────────────────────────────── US-004: updatePassword ────────
  describe('US-004 — updatePassword (Cambiar contraseña)', () => {
    it('AC-014: should update password hash for active admin', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }]) // admin exists
        .mockResolvedValueOnce(undefined); // update

      const result = await service.updatePassword(TENANT_ID, USER_ID, {
        password: 'NewPass123!',
      });

      expect(result).toEqual({ success: true });
      // Verify password_hash was updated
      const updateCall = mockManager.query.mock.calls[1];
      expect(updateCall[0]).toContain('password_hash');
      expect(updateCall[1][0]).toBe('$2b$10$hashedpassword');
    });

    // AC-016: an administrator picked this password, not its owner, so the
    // account is held until the owner replaces it.
    it('AC-016: raises force_password_reset on the target account', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }])
        .mockResolvedValueOnce(undefined);

      await service.updatePassword(TENANT_ID, USER_ID, {
        password: 'NewPass123!',
      });

      expect(mockManager.query.mock.calls[1][0]).toMatch(
        /force_password_reset\s*=\s*true/,
      );
    });

    it('should reject password change for non-existent admin', async () => {
      const { service, mockManager, authService } = createService();
      mockManager.query.mockResolvedValueOnce([]); // not found

      await expect(
        service.updatePassword(TENANT_ID, 'ghost-id', { password: 'Pass123!' }),
      ).rejects.toThrow(NotFoundException);
      expect(authService.revokeUserTokens).not.toHaveBeenCalled();
    });

    // The force_password_reset hold is served from the cached auth state, so
    // the committed write must drop that entry or the hold stays invisible for
    // up to the cache TTL. It must also revoke any JWT minted under the old
    // password, or a stolen/still-open session would keep working.
    it('revokes tokens and drops the cached auth state after the password change', async () => {
      const { service, mockManager, authService } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }])
        .mockResolvedValueOnce(undefined);

      await service.updatePassword(TENANT_ID, USER_ID, {
        password: 'NewPass123!',
      });

      expect(authService.revokeUserTokens).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
    });

    // The password update has ALREADY committed by the time invalidateAuthState
    // runs, so a revocation failure must not make an already-succeeded
    // request report as failed. Logged loudly instead.
    it('does not fail the request when revocation fails, but logs it loudly', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      const { service, mockManager, authService } = createService();
      authService.revokeUserTokens.mockRejectedValue(new Error('DB down'));
      mockManager.query
        .mockResolvedValueOnce([{ id: USER_ID }])
        .mockResolvedValueOnce(undefined);

      await expect(
        service.updatePassword(TENANT_ID, USER_ID, {
          password: 'NewPass123!',
        }),
      ).resolves.toEqual({ success: true });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(USER_ID));
    });
  });

  // ─────────────────────────────── US-005: softDelete ────────────
  describe('US-005 — softDelete (Eliminación lógica)', () => {
    it('AC-018: should soft-delete when more than one admin active', async () => {
      const { service, mockManager } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ count: '2' }]) // count active admins
        .mockResolvedValueOnce([[{ id: USER_ID }], 1]); // update returning

      const result = await service.softDelete(TENANT_ID, USER_ID);

      expect(result).toEqual({ success: true });
      // Verify is_active = false
      const updateCall = mockManager.query.mock.calls[1];
      expect(updateCall[0]).toContain('is_active = false');
    });

    it('AC-019: should block deletion of last active admin (409)', async () => {
      const { service, mockManager } = createService();
      mockManager.query.mockResolvedValueOnce([{ count: '1' }]); // only 1 admin

      await expect(service.softDelete(TENANT_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('AC-019: should block deletion when zero admins (edge: race condition)', async () => {
      const { service, mockManager } = createService();
      mockManager.query.mockResolvedValueOnce([{ count: '0' }]); // 0 admins

      await expect(service.softDelete(TENANT_ID, USER_ID)).rejects.toThrow(
        ConflictException,
      );
    });

    it('EC-005: should return 404 for already-deleted admin', async () => {
      const { service, mockManager, authService } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ count: '3' }]) // 3 active
        .mockResolvedValueOnce([[], 0]); // update affected 0 rows

      await expect(service.softDelete(TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(authService.revokeUserTokens).not.toHaveBeenCalled();
    });

    // A deactivated admin holding a still-valid JWT would keep their cached
    // permissions AND a working session until the JWT's own 24h lifetime ran
    // out without this — revokeUserTokens closes that window down to the
    // cache's freshness window instead.
    it('revokes tokens and drops the cached auth state after the deactivation', async () => {
      const { service, mockManager, authService } = createService();
      mockManager.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([[{ id: USER_ID }], 1]);

      await service.softDelete(TENANT_ID, USER_ID);

      expect(authService.revokeUserTokens).toHaveBeenCalledWith(
        TENANT_ID,
        USER_ID,
      );
    });

    it('does not fail the deactivation when revocation fails, but logs it loudly', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      const { service, mockManager, authService } = createService();
      authService.revokeUserTokens.mockRejectedValue(new Error('DB down'));
      mockManager.query
        .mockResolvedValueOnce([{ count: '2' }])
        .mockResolvedValueOnce([[{ id: USER_ID }], 1]);

      await expect(
        service.softDelete(TENANT_ID, USER_ID),
      ).resolves.toEqual({ success: true });

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(USER_ID));
    });
  });
});
