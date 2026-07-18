import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let authService: AuthService;
  let mockTenantService: any;
  let mockTenantsService: any;
  let mockJwtService: any;

  const mockCompany = {
    id: 'uuid-company-A',
    subdomain: 'colegio',
    commercialName: 'Colegio Innovador',
    isActive: true,
  };

  const mockUser: Partial<User> = {
    id: 'uuid-user-1',
    email: 'admin@colegio.com',
    passwordHash: '', // Will be set in beforeEach
    name: 'Admin Colegio',
    companyId: 'uuid-company-A',
    isActive: true,
  };

  const mockRoles = [
    {
      name: 'admin',
      permissions: ['view_catalogs', 'edit_catalogs', 'generate_material'],
    },
  ];

  beforeEach(async () => {
    // Generate a real bcrypt hash for testing
    const hash = await bcrypt.hash('password123', 10);
    mockUser.passwordHash = hash;

    mockTenantService = {
      runInTenant: jest.fn(),
      runInSchema: jest.fn(),
    };

    mockTenantsService = {
      findBySubdomain: jest.fn(),
    };

    mockJwtService = {
      sign: jest.fn().mockReturnValue('mock-jwt-token'),
      verify: jest.fn(),
    };

    const mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    authService = new AuthService(
      mockTenantService,
      mockTenantsService,
      mockJwtService,
      mockCacheManager as any,
    );
  });

  describe('validateUser', () => {
    it('should return user data for valid credentials', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);
      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(mockUser),
            query: jest.fn().mockResolvedValue(mockRoles),
          };
          return operation(mockManager);
        },
      );

      const result = await authService.validateUser(
        'admin@colegio.com',
        'password123',
        'colegio',
      );

      expect(result).not.toBeNull();
      expect(result!.user.id).toBe('uuid-user-1');
      expect(result!.user.email).toBe('admin@colegio.com');
      expect(result!.companyId).toBe('uuid-company-A');
      expect(result!.roles).toEqual(['admin']);
      expect(result!.permissions).toEqual([
        'view_catalogs',
        'edit_catalogs',
        'generate_material',
      ]);
    });

    it('should return null for unknown subdomain', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(null);

      const result = await authService.validateUser(
        'admin@colegio.com',
        'password123',
        'nonexistent',
      );

      expect(result).toBeNull();
      expect(mockTenantService.runInSchema).not.toHaveBeenCalled();
    });

    it('should return null for invalid password', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);
      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(mockUser),
            query: jest.fn(),
          };
          return operation(mockManager);
        },
      );

      const result = await authService.validateUser(
        'admin@colegio.com',
        'wrong-password',
        'colegio',
      );

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);
      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            query: jest.fn(),
          };
          return operation(mockManager);
        },
      );

      const result = await authService.validateUser(
        'nonexistent@colegio.com',
        'password123',
        'colegio',
      );

      expect(result).toBeNull();
    });

    it('should return null for cross-tenant access attempt', async () => {
      // User belongs to company-A but trying to login via company-B subdomain
      const companyB = {
        ...mockCompany,
        id: 'uuid-company-B',
        subdomain: 'escuela',
      };
      mockTenantsService.findBySubdomain.mockResolvedValue(companyB);

      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          // User's companyId is uuid-company-A, but schema is for company-B
          const userInWrongTenant = {
            ...mockUser,
            companyId: 'uuid-company-A', // Doesn't match company-B
          };
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(userInWrongTenant),
            query: jest.fn(),
          };
          return operation(mockManager);
        },
      );

      const result = await authService.validateUser(
        'admin@colegio.com',
        'password123',
        'escuela',
      );

      expect(result).toBeNull();
    });

    it('should use correct schema name for tenant lookup', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);
      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            query: jest.fn(),
          };
          return operation(mockManager);
        },
      );

      await authService.validateUser(
        'admin@colegio.com',
        'password123',
        'colegio',
      );

      expect(mockTenantService.runInSchema).toHaveBeenCalledWith(
        'tenant_uuid-company-A',
        expect.any(Function),
      );
    });
  });

  describe('generateToken', () => {
    it('should call jwtService.sign with correct payload', () => {
      const payload = {
        sub: 'uuid-user-1',
        companyId: 'uuid-company-A',
        roles: ['admin'],
        permissions: ['view_catalogs'],
      };

      const token = authService.generateToken(payload);

      expect(mockJwtService.sign).toHaveBeenCalledWith(payload);
      expect(token).toBe('mock-jwt-token');
    });
  });

  describe('verifyToken', () => {
    it('should return decoded payload for valid token', () => {
      const decoded = { sub: 'uuid-user-1', companyId: 'uuid-company-A' };
      mockJwtService.verify.mockReturnValue(decoded);

      const result = authService.verifyToken('valid-token');

      expect(result).toEqual(decoded);
    });

    it('should throw UnauthorizedException for invalid token', () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });

      expect(() => authService.verifyToken('invalid-token')).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getUserFromToken', () => {
    it('should return user data from valid token payload', async () => {
      const payload = {
        sub: 'uuid-user-1',
        companyId: 'uuid-company-A',
        roles: ['admin'],
        permissions: ['view_catalogs'],
      };

      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(mockUser),
            query: jest.fn().mockResolvedValue(mockRoles),
          };
          return operation(mockManager);
        },
      );

      const result = await authService.getUserFromToken(payload);

      expect(result.id).toBe('uuid-user-1');
      expect(result.email).toBe('admin@colegio.com');
      expect(result.roles).toEqual(['admin']);
    });

    it('should throw UnauthorizedException for deactivated user', async () => {
      const payload = {
        sub: 'uuid-user-1',
        companyId: 'uuid-company-A',
        roles: ['admin'],
        permissions: [],
      };

      mockTenantService.runInSchema.mockImplementation(
        async (_schema: string, operation: Function) => {
          const mockManager = {
            findOne: jest.fn().mockResolvedValue(null),
            query: jest.fn().mockResolvedValue([]),
          };
          return operation(mockManager);
        },
      );

      await expect(authService.getUserFromToken(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});

// ───────────────── A: role inheritance on the permission path ──────
describe('AuthService.getUserPermissions with role inheritance', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';

  function build(
    rows: Array<{ permissions: string[] | null }>,
    forcePasswordReset = false,
  ) {
    const manager = {
      query: jest.fn().mockResolvedValue(rows),
      // getUserAuthState reads the password-reset hold from the same lookup.
      findOne: jest.fn().mockResolvedValue({ id: USER_ID, forcePasswordReset }),
    };
    const tenantService = {
      runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
        op(manager),
      ),
    };
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      tenantService as any,
      { findBySubdomain: jest.fn() } as any,
      { sign: jest.fn(), verify: jest.fn() } as any,
      cacheManager as any,
    );
    return { service, manager, tenantService, cacheManager };
  }

  it('returns the flattened set including INHERITED permissions', async () => {
    // Two rows: the directly-held role and one reached through inheritance.
    // The old flat query joined user_roles only and would have returned just
    // the first.
    const { service } = build([
      { permissions: ['EDIT_SYLLABUS'] },
      { permissions: ['VIEW_SYLLABUS'] },
    ]);

    const permissions = await service.getUserPermissions(USER_ID, COMPANY_ID);

    expect(permissions.sort()).toEqual(['EDIT_SYLLABUS', 'VIEW_SYLLABUS']);
  });

  it('de-duplicates a permission shared by a role and its ancestor', async () => {
    const { service } = build([
      { permissions: ['SHARED', 'A'] },
      { permissions: ['SHARED', 'B'] },
    ]);

    const permissions = await service.getUserPermissions(USER_ID, COMPANY_ID);

    expect(permissions.sort()).toEqual(['A', 'B', 'SHARED']);
  });

  it('resolves the hierarchy with a cycle-safe recursive query', async () => {
    const { service, manager } = build([]);

    await service.getUserPermissions(USER_ID, COMPANY_ID);

    const [sql, params] = manager.query.mock.calls[0];
    expect(sql).toContain('WITH RECURSIVE');
    // UNION, not UNION ALL: this is what makes a cyclic hierarchy terminate.
    expect(sql).not.toContain('UNION ALL');
    expect(params).toEqual([USER_ID]);
  });

  it('resolves against the tenant schema derived from the company id', async () => {
    const { service, tenantService } = build([]);

    await service.getUserPermissions(USER_ID, COMPANY_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledWith(
      `tenant_${COMPANY_ID}`,
      expect.any(Function),
    );
  });

  it('serves the cached set without re-resolving the hierarchy', async () => {
    const { service, manager, cacheManager } = build([]);
    cacheManager.get.mockResolvedValue({
      permissions: ['CACHED'],
      forcePasswordReset: false,
    });

    expect(await service.getUserPermissions(USER_ID, COMPANY_ID)).toEqual([
      'CACHED',
    ]);
    expect(manager.query).not.toHaveBeenCalled();
  });
});

// ───────── AC-016: the password-reset hold rides the permission lookup ────────
describe('AuthService password-reset hold', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';

  function build(user: any) {
    const manager = {
      query: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(user),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const tenantService = {
      runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
        op(manager),
      ),
    };
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      tenantService as any,
      { findBySubdomain: jest.fn() } as any,
      { sign: jest.fn(), verify: jest.fn() } as any,
      cacheManager as any,
    );
    return { service, manager, cacheManager };
  }

  async function heldUser(password = 'current-password') {
    return {
      id: USER_ID,
      isActive: true,
      passwordHash: await bcrypt.hash(password, 10),
      forcePasswordReset: true,
    };
  }

  describe('getUserAuthState', () => {
    it('reports the hold alongside the permissions', async () => {
      const { service } = build(await heldUser());

      const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

      expect(state.forcePasswordReset).toBe(true);
    });

    it('caches permissions and the hold together under one key', async () => {
      const { service, cacheManager } = build(await heldUser());

      await service.getUserAuthState(USER_ID, COMPANY_ID);

      expect(cacheManager.set).toHaveBeenCalledWith(
        `auth:permissions:${COMPANY_ID}:${USER_ID}`,
        expect.objectContaining({ forcePasswordReset: true }),
        60 * 1000,
      );
    });

    it('does not hold an account whose user row has vanished', async () => {
      const { service } = build(null);

      const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

      expect(state.forcePasswordReset).toBe(false);
    });
  });

  describe('changePassword', () => {
    it('rejects a wrong current password and leaves the hold in place', async () => {
      const { service, manager } = build(await heldUser());

      await expect(
        service.changePassword(USER_ID, COMPANY_ID, 'not-it', 'brand-new-pass'),
      ).rejects.toThrow(UnauthorizedException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects reusing the current password', async () => {
      const { service, manager } = build(await heldUser('current-password'));

      await expect(
        service.changePassword(
          USER_ID,
          COMPANY_ID,
          'current-password',
          'current-password',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(manager.update).not.toHaveBeenCalled();
    });

    it('rejects a session whose account is gone', async () => {
      const { service } = build(null);

      await expect(
        service.changePassword(USER_ID, COMPANY_ID, 'whatever', 'new-password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('stores a new bcrypt hash and clears the hold', async () => {
      const { service, manager } = build(await heldUser('current-password'));

      await service.changePassword(
        USER_ID,
        COMPANY_ID,
        'current-password',
        'brand-new-pass',
      );

      const [, criteria, patch] = manager.update.mock.calls[0];
      expect(criteria).toEqual({ id: USER_ID });
      expect(patch.forcePasswordReset).toBe(false);
      expect(await bcrypt.compare('brand-new-pass', patch.passwordHash)).toBe(
        true,
      );
    });

    it('invalidates the cached entry so the hold lifts before the TTL', async () => {
      const { service, cacheManager } = build(
        await heldUser('current-password'),
      );

      await service.changePassword(
        USER_ID,
        COMPANY_ID,
        'current-password',
        'brand-new-pass',
      );

      expect(cacheManager.del).toHaveBeenCalledWith(
        `auth:permissions:${COMPANY_ID}:${USER_ID}`,
      );
    });
  });
});
