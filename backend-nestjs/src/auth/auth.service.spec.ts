import {
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
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
    status: 'ACTIVE',
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

    // Login bypasses TenantMiddleware (@Public + subdomain from body), so
    // validateUser must enforce the same subscription rules the middleware
    // applies to every other route.
    describe('company subscription status', () => {
      function mockTenantWithUser() {
        mockTenantService.runInSchema.mockImplementation(
          async (_schema: string, operation: Function) => {
            const mockManager = {
              findOne: jest.fn().mockResolvedValue(mockUser),
              query: jest.fn().mockResolvedValue(mockRoles),
            };
            return operation(mockManager);
          },
        );
      }

      it('should reject login for a SUSPENDED company with ForbiddenException even with valid credentials', async () => {
        mockTenantsService.findBySubdomain.mockResolvedValue({
          ...mockCompany,
          status: 'SUSPENDED',
        });
        mockTenantWithUser();

        await expect(
          authService.validateUser(
            'admin@colegio.com',
            'password123',
            'colegio',
          ),
        ).rejects.toThrow(ForbiddenException);
      });

      it('should reject a SUSPENDED company with the same message the middleware uses', async () => {
        mockTenantsService.findBySubdomain.mockResolvedValue({
          ...mockCompany,
          status: 'SUSPENDED',
        });

        await expect(
          authService.validateUser(
            'admin@colegio.com',
            'password123',
            'colegio',
          ),
        ).rejects.toThrow(
          "The company 'colegio' is currently suspended. Please contact support.",
        );
      });

      it('should reject a SUSPENDED company before touching the tenant schema or credentials', async () => {
        mockTenantsService.findBySubdomain.mockResolvedValue({
          ...mockCompany,
          status: 'SUSPENDED',
        });

        await expect(
          authService.validateUser(
            'admin@colegio.com',
            'password123',
            'colegio',
          ),
        ).rejects.toThrow(ForbiddenException);
        expect(mockTenantService.runInSchema).not.toHaveBeenCalled();
      });

      it('should return null for an inactive company (findBySubdomain filters is_active)', async () => {
        // TenantsService.findBySubdomain queries with isActive: true, so an
        // inactive company resolves to null — same filter the middleware uses.
        mockTenantsService.findBySubdomain.mockResolvedValue(null);

        const result = await authService.validateUser(
          'admin@colegio.com',
          'password123',
          'colegio',
        );

        expect(result).toBeNull();
        expect(mockTenantService.runInSchema).not.toHaveBeenCalled();
      });

      it('should allow login for a GRACE_PERIOD company', async () => {
        mockTenantsService.findBySubdomain.mockResolvedValue({
          ...mockCompany,
          status: 'GRACE_PERIOD',
        });
        mockTenantWithUser();

        const result = await authService.validateUser(
          'admin@colegio.com',
          'password123',
          'colegio',
        );

        expect(result).not.toBeNull();
        expect(result!.user.id).toBe('uuid-user-1');
      });

      it('should allow login for an ACTIVE company', async () => {
        mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);
        mockTenantWithUser();

        const result = await authService.validateUser(
          'admin@colegio.com',
          'password123',
          'colegio',
        );

        expect(result).not.toBeNull();
        expect(result!.companyId).toBe('uuid-company-A');
      });
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

// ─── P0: the per-request permission cache must not hang the authenticated API ──
// getUserAuthState runs inside JwtAuthGuard on every authenticated request, over
// a Redis client with no command timeout. A hung or broken cache must degrade to
// a DB-computed lookup, never hang and never turn into a 401.
describe('AuthService bounded permission cache', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';
  const CACHE_KEY = `auth:permissions:${COMPANY_ID}:${USER_ID}`;

  function build(
    cacheOverrides: Partial<{
      get: jest.Mock;
      set: jest.Mock;
      del: jest.Mock;
    }> = {},
  ) {
    // The DB path resolves one flattened-permission row and a live user, so a
    // fall-through produces a recognizable, non-empty state.
    const manager = {
      query: jest.fn().mockResolvedValue([{ permissions: ['FROM_DB'] }]),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, forcePasswordReset: false }),
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
      ...cacheOverrides,
    };
    const service = new AuthService(
      tenantService as any,
      { findBySubdomain: jest.fn() } as any,
      { sign: jest.fn(), verify: jest.fn() } as any,
      cacheManager as any,
    );
    return { service, manager, tenantService, cacheManager };
  }

  it('serves a cache hit without touching the database', async () => {
    const { service, manager } = build({
      get: jest.fn().mockResolvedValue({
        permissions: ['CACHED'],
        forcePasswordReset: true,
      }),
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state).toEqual({
      permissions: ['CACHED'],
      forcePasswordReset: true,
    });
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('computes from the database and caches the result on a miss', async () => {
    const { service, manager, cacheManager } = build();

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state).toEqual({
      permissions: ['FROM_DB'],
      forcePasswordReset: false,
      tokensValidAfter: null,
    });
    expect(manager.query).toHaveBeenCalled();
    expect(cacheManager.set).toHaveBeenCalledWith(CACHE_KEY, state, 60 * 1000);
  });

  it('degrades to the database when the cache read rejects', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, manager } = build({
      get: jest.fn().mockRejectedValue(new Error('Redis connection refused')),
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state.permissions).toEqual(['FROM_DB']);
    expect(manager.query).toHaveBeenCalled();
    // One warn per bypass so a Redis problem is visible without being deafening.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain(USER_ID);
    warn.mockRestore();
  });

  it('still returns the DB-computed value when the cache write fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service } = build({
      set: jest.fn().mockRejectedValue(new Error('write timed out')),
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state).toEqual({
      permissions: ['FROM_DB'],
      forcePasswordReset: false,
      tokensValidAfter: null,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  // The core P0 case: a cache read that NEVER settles (a hung Redis) must trip
  // the timer and fall through to the DB — not hang, not throw a 401.
  describe('when the cache read hangs', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('times out and degrades to the database instead of hanging', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service, manager } = build({
        get: jest.fn().mockReturnValue(new Promise<never>(() => {})),
      });

      const pending = service.getUserAuthState(USER_ID, COMPANY_ID);
      // Default bound is 1000ms; advancing past it rejects the read.
      await jest.advanceTimersByTimeAsync(1000);
      const state = await pending;

      expect(state.permissions).toEqual(['FROM_DB']);
      expect(manager.query).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0][0])).toContain('timed out');
      warn.mockRestore();
    });

    it('leaves no pending timer behind on the fast path', async () => {
      const { service } = build({
        get: jest.fn().mockResolvedValue({
          permissions: ['CACHED'],
          forcePasswordReset: false,
        }),
      });

      await service.getUserAuthState(USER_ID, COMPANY_ID);

      // The race timer must be cleared once the read settles, or every request
      // would leak a handle onto the event loop.
      expect(jest.getTimerCount()).toBe(0);
    });
  });

  // Invalidation is documented best-effort and always runs after a committed
  // database write, so it must be as bounded and non-throwing as the reads.
  describe('invalidateUserPermissions', () => {
    it('deletes the cached entry', async () => {
      const { service, cacheManager } = build();

      await service.invalidateUserPermissions(COMPANY_ID, USER_ID);

      expect(cacheManager.del).toHaveBeenCalledWith(CACHE_KEY);
    });

    it('logs and swallows a delete rejection instead of throwing', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service } = build({
        del: jest.fn().mockRejectedValue(new Error('Redis down')),
      });

      await expect(
        service.invalidateUserPermissions(COMPANY_ID, USER_ID),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('times out a hung delete instead of hanging the caller', async () => {
      jest.useFakeTimers();
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const { service } = build({
        del: jest.fn().mockReturnValue(new Promise<never>(() => {})),
      });

      const pending = service.invalidateUserPermissions(COMPANY_ID, USER_ID);
      await jest.advanceTimersByTimeAsync(1000);
      await expect(pending).resolves.toBeUndefined();

      expect(String(warn.mock.calls[0][0])).toContain('timed out');
      warn.mockRestore();
      jest.useRealTimers();
    });
  });
});

// ── stampede damper: the local per-process cache tier between Redis and DB ──
// Guards against pool exhaustion under a sustained Redis outage or an ordinary
// cache-miss stampede: repeated getUserAuthState calls for the SAME
// (userId, companyId) within a short window must open at most one Postgres
// transaction, not one per call.
describe('AuthService local auth-state cache tier', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';
  const CACHE_KEY = `auth:permissions:${COMPANY_ID}:${USER_ID}`;

  function build() {
    const manager = {
      query: jest.fn().mockResolvedValue([{ permissions: ['FROM_DB'] }]),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, forcePasswordReset: false }),
    };
    const tenantService = {
      runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
        op(manager),
      ),
    };
    // Redis is always a miss here so every call falls through past it — the
    // local tier below is what should absorb the repeats.
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

  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('hits Postgres only once for two rapid calls within the local TTL window', async () => {
    const { service, tenantService } = build();

    const first = await service.getUserAuthState(USER_ID, COMPANY_ID);
    const second = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  it('hits Postgres again once the local TTL has elapsed', async () => {
    const { service, tenantService } = build();

    await service.getUserAuthState(USER_ID, COMPANY_ID);
    // Local TTL is a few seconds; 5s comfortably clears it.
    await jest.advanceTimersByTimeAsync(5000);
    await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledTimes(2);
  });

  it('invalidateUserPermissions clears the local entry so the next call hits Postgres, not the stale value', async () => {
    const { service, manager, tenantService } = build();

    await service.getUserAuthState(USER_ID, COMPANY_ID);
    manager.query.mockResolvedValue([{ permissions: ['ROTATED'] }]);
    await service.invalidateUserPermissions(COMPANY_ID, USER_ID);
    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledTimes(2);
    expect(state.permissions).toEqual(['ROTATED']);
  });

  it('populates the local tier alongside the Redis write', async () => {
    const { service, cacheManager, tenantService } = build();

    await service.getUserAuthState(USER_ID, COMPANY_ID);
    await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(cacheManager.set).toHaveBeenCalledWith(
      CACHE_KEY,
      expect.objectContaining({ permissions: ['FROM_DB'] }),
      60 * 1000,
    );
    expect(tenantService.runInSchema).toHaveBeenCalledTimes(1);
  });

  it('still damps repeated Postgres calls when the Redis write itself fails', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const manager = {
      query: jest.fn().mockResolvedValue([{ permissions: ['FROM_DB'] }]),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: USER_ID, forcePasswordReset: false }),
    };
    const tenantService = {
      runInSchema: jest.fn((_schema: string, op: (m: any) => Promise<any>) =>
        op(manager),
      ),
    };
    const cacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockRejectedValue(new Error('Redis down')),
      del: jest.fn().mockResolvedValue(undefined),
    };
    const service = new AuthService(
      tenantService as any,
      { findBySubdomain: jest.fn() } as any,
      { sign: jest.fn(), verify: jest.fn() } as any,
      cacheManager as any,
    );

    await service.getUserAuthState(USER_ID, COMPANY_ID);
    await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

// ── local cache eviction: bounded size, oldest-inserted evicted first ──
describe('AuthService local auth-state cache eviction', () => {
  function build() {
    const manager = {
      query: jest.fn().mockResolvedValue([{ permissions: ['FROM_DB'] }]),
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'x', forcePasswordReset: false }),
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
    return { service, tenantService };
  }

  // Exercises the eviction logic directly against a small test-only cap
  // rather than inserting thousands of entries: the eviction policy itself
  // (oldest-inserted-first, via Map insertion order) is what is under test,
  // not the production cap value.
  it('evicts the oldest inserted entry once the cache is at capacity', async () => {
    const { service, tenantService } = build();
    const capField = 'LOCAL_CACHE_MAX_ENTRIES';
    const originalCap = (AuthService as any)[capField];
    (AuthService as any)[capField] = 2;

    try {
      await service.getUserAuthState('user-a', 'company-1'); // oldest
      await service.getUserAuthState('user-b', 'company-1');
      // A third distinct key pushes the cache over the 2-entry cap, evicting
      // user-a's entry — its next lookup must hit Postgres again.
      await service.getUserAuthState('user-c', 'company-1');

      tenantService.runInSchema.mockClear();
      await service.getUserAuthState('user-a', 'company-1');
      expect(tenantService.runInSchema).toHaveBeenCalledTimes(1);

      tenantService.runInSchema.mockClear();
      await service.getUserAuthState('user-c', 'company-1');
      expect(tenantService.runInSchema).not.toHaveBeenCalled();
    } finally {
      (AuthService as any)[capField] = originalCap;
    }
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

    // The password change above already committed; a revocation failure must
    // not make this report as failed when the password genuinely did change.
    it('does not fail when revocation fails, but logs it loudly', async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation();
      const { service, manager } = build(await heldUser('current-password'));
      manager.update
        .mockResolvedValueOnce({ affected: 1 })
        .mockRejectedValueOnce(new Error('DB down'));

      await expect(
        service.changePassword(
          USER_ID,
          COMPANY_ID,
          'current-password',
          'brand-new-pass',
        ),
      ).resolves.toBeUndefined();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining(USER_ID));
    });
  });
});

// ───────────────── JWT revocation: AuthService.revokeUserTokens ─────────────
// The durable half of revocation: stamps users.tokens_valid_after so
// JwtAuthGuard can reject a token issued before that instant, even one that
// has not otherwise expired. Wired into every mutation that changes a user's
// authority or account state (see call sites in auth.service.ts,
// tenant-admins.service.ts, tenants-admin.service.ts, roles.service.ts).
describe('AuthService.revokeUserTokens', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';
  const CACHE_KEY = `auth:permissions:${COMPANY_ID}:${USER_ID}`;

  function build() {
    const manager = {
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
    return { service, manager, tenantService, cacheManager };
  }

  it('stamps tokens_valid_after on the user row in the tenant schema', async () => {
    const { service, manager, tenantService } = build();

    await service.revokeUserTokens(COMPANY_ID, USER_ID);

    expect(tenantService.runInSchema).toHaveBeenCalledWith(
      `tenant_${COMPANY_ID}`,
      expect.any(Function),
    );
    expect(manager.update).toHaveBeenCalledWith(
      User,
      { id: USER_ID },
      { tokensValidAfter: expect.any(Date) },
    );
  });

  it('drops the cached auth state (both tiers) after the write', async () => {
    const { service, cacheManager } = build();

    await service.revokeUserTokens(COMPANY_ID, USER_ID);

    expect(cacheManager.del).toHaveBeenCalledWith(CACHE_KEY);
  });

  // The database write is the durable source of truth this mechanism exists
  // to provide — unlike the cache drop, it must NOT be swallowed. A caller
  // that awaits revokeUserTokens must see the failure.
  it('propagates a database failure instead of swallowing it', async () => {
    const { service, manager } = build();
    manager.update.mockRejectedValue(new Error('connection lost'));

    await expect(
      service.revokeUserTokens(COMPANY_ID, USER_ID),
    ).rejects.toThrow('connection lost');
  });

  // The cache drop is best-effort, exactly like every other cache access in
  // this file: a Redis failure must not turn a successful, durable
  // revocation into a thrown error.
  it('still resolves when the cache drop fails, since the DB write already succeeded', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { service, cacheManager } = build();
    cacheManager.del.mockRejectedValue(new Error('Redis down'));

    await expect(
      service.revokeUserTokens(COMPANY_ID, USER_ID),
    ).resolves.toBeUndefined();

    warn.mockRestore();
  });
});

// ── tokensValidAfter threading through getUserAuthState's cache tiers ──
// JwtAuthGuard's revocation check depends on tokensValidAfter surviving the
// Redis round-trip and the local stampede-damper tier unchanged.
describe('AuthService.getUserAuthState tokensValidAfter threading', () => {
  const COMPANY_ID = 'company-1';
  const USER_ID = 'user-1';
  const REVOKED_AT = new Date('2026-01-01T00:00:00.000Z');

  function build(user: any) {
    const manager = {
      query: jest.fn().mockResolvedValue([{ permissions: [] }]),
      findOne: jest.fn().mockResolvedValue(user),
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
    return { service, cacheManager };
  }

  it('defaults to null when the account has never been revoked', async () => {
    const { service } = build({
      id: USER_ID,
      forcePasswordReset: false,
      tokensValidAfter: null,
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state.tokensValidAfter).toBeNull();
  });

  it('converts a revoked user Date column to epoch milliseconds', async () => {
    const { service } = build({
      id: USER_ID,
      forcePasswordReset: false,
      tokensValidAfter: REVOKED_AT,
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state.tokensValidAfter).toBe(REVOKED_AT.getTime());
  });

  it('caches tokensValidAfter as a plain number, not a Date, so it survives Redis', async () => {
    const { service, cacheManager } = build({
      id: USER_ID,
      forcePasswordReset: false,
      tokensValidAfter: REVOKED_AT,
    });

    await service.getUserAuthState(USER_ID, COMPANY_ID);

    const [, cachedValue] = cacheManager.set.mock.calls[0];
    expect(typeof cachedValue.tokensValidAfter).toBe('number');
    expect(cachedValue.tokensValidAfter).toBe(REVOKED_AT.getTime());
  });

  it('threads tokensValidAfter back out of a Redis cache hit', async () => {
    const { service, cacheManager } = build({
      id: USER_ID,
      forcePasswordReset: false,
      tokensValidAfter: null,
    });
    cacheManager.get.mockResolvedValue({
      permissions: [],
      forcePasswordReset: false,
      tokensValidAfter: REVOKED_AT.getTime(),
    });

    const state = await service.getUserAuthState(USER_ID, COMPANY_ID);

    expect(state.tokensValidAfter).toBe(REVOKED_AT.getTime());
  });

  it('threads tokensValidAfter through the local stampede-damper tier', async () => {
    jest.useFakeTimers();
    try {
      const { service } = build({
        id: USER_ID,
        forcePasswordReset: false,
        tokensValidAfter: REVOKED_AT,
      });

      const first = await service.getUserAuthState(USER_ID, COMPANY_ID);
      // Within the local TTL: served from the local tier, not recomputed.
      const second = await service.getUserAuthState(USER_ID, COMPANY_ID);

      expect(first.tokensValidAfter).toBe(REVOKED_AT.getTime());
      expect(second.tokensValidAfter).toBe(REVOKED_AT.getTime());
    } finally {
      jest.useRealTimers();
    }
  });
});
