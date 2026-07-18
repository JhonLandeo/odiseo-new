import { UnauthorizedException } from '@nestjs/common';
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
