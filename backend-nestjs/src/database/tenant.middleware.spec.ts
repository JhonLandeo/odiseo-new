import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { Company } from '../tenants/entities/tenant.entity';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let mockCls: any;
  let mockTenantsService: any;

  const mockCompany: Partial<Company> = {
    id: 'uuid-company-A',
    subdomain: 'colegio',
    commercialName: 'Colegio Innovador',
    isActive: true,
  };

  beforeEach(() => {
    mockCls = {
      set: jest.fn(),
      get: jest.fn(),
    };

    // The middleware resolves companies through the cached TenantsService
    // lookup; caching behavior itself is covered in tenants.service.spec.ts.
    mockTenantsService = {
      findBySubdomain: jest.fn(),
    };

    middleware = new TenantMiddleware(mockCls, mockTenantsService);
  });

  const createMockReq = (overrides: any = {}): any => ({
    headers: { host: 'colegio.odiseo.com' },
    baseUrl: '',
    path: '/api/v1/catalogs',
    ...overrides,
  });

  const mockRes = {} as any;
  const mockNext = jest.fn();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('subdomain extraction', () => {
    it('should extract subdomain from host header', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);

      await middleware.use(
        createMockReq({ headers: { host: 'colegio.odiseo.com' } }),
        mockRes,
        mockNext,
      );

      expect(mockCls.set).toHaveBeenCalledWith('subdomain', 'colegio');
      expect(mockCls.set).toHaveBeenCalledWith(
        'tenantSchema',
        'tenant_uuid-company-A',
      );
      expect(mockCls.set).toHaveBeenCalledWith('companyId', 'uuid-company-A');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should extract subdomain from x-subdomain header', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);

      await middleware.use(
        createMockReq({
          headers: { host: 'localhost:3000', 'x-subdomain': 'colegio' },
        }),
        mockRes,
        mockNext,
      );

      expect(mockCls.set).toHaveBeenCalledWith('subdomain', 'colegio');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should prefer x-subdomain header over host', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);

      await middleware.use(
        createMockReq({
          headers: { host: 'escuela.odiseo.com', 'x-subdomain': 'colegio' },
        }),
        mockRes,
        mockNext,
      );

      expect(mockCls.set).toHaveBeenCalledWith('subdomain', 'colegio');
    });
  });

  describe('public paths', () => {
    it('should skip tenant resolution for branding endpoint', async () => {
      await middleware.use(
        createMockReq({
          headers: { host: 'localhost:3000' },
          path: '/api/v1/tenants/branding',
        }),
        mockRes,
        mockNext,
      );

      expect(mockTenantsService.findBySubdomain).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    // Platform-level routes: they take an explicit tenant id or touch no
    // tenant schema, so they must stay exempt from tenant resolution.
    it.each([
      '/api/v1/admin/tenants',
      '/api/v1/admin/tenants/tenant-1/admins',
      '/api/v1/admin/dashboard/metrics',
      '/api/v1/admin/subscriptions',
      '/api/v1/admin/permissions',
      '/api/v1/tenants/branding',
      '/queues',
    ])(
      'should skip tenant resolution for the platform path %s',
      async (path) => {
        await middleware.use(
          createMockReq({ headers: { host: 'localhost:3000' }, path }),
          mockRes,
          mockNext,
        );

        expect(mockTenantsService.findBySubdomain).not.toHaveBeenCalled();
        expect(mockCls.set).not.toHaveBeenCalledWith(
          'companyId',
          expect.anything(),
        );
        expect(mockCls.set).not.toHaveBeenCalledWith(
          'tenantSchema',
          expect.anything(),
        );
        expect(mockNext).toHaveBeenCalled();
      },
    );

    // Regression guard for the blanket '/api/v1/admin' exemption: these admin
    // controllers read and write the per-tenant schema, so they MUST resolve
    // the tenant like any other tenant-scoped route.
    it.each([
      '/api/v1/admin/roles',
      '/api/v1/admin/roles/role-1',
      '/api/v1/admin/users',
      '/api/v1/admin/users/abc/roles',
    ])(
      'should resolve the tenant for the tenant-scoped path %s',
      async (path) => {
        mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);

        await middleware.use(
          createMockReq({ headers: { host: 'colegio.odiseo.com' }, path }),
          mockRes,
          mockNext,
        );

        expect(mockTenantsService.findBySubdomain).toHaveBeenCalled();
        expect(mockCls.set).toHaveBeenCalledWith('companyId', 'uuid-company-A');
        expect(mockCls.set).toHaveBeenCalledWith(
          'tenantSchema',
          'tenant_uuid-company-A',
        );
        expect(mockNext).toHaveBeenCalled();
      },
    );

    it('should reject a tenant-scoped admin path when no subdomain is present', async () => {
      await expect(
        middleware.use(
          createMockReq({
            headers: { host: 'localhost:3000' },
            path: '/api/v1/admin/roles',
          }),
          mockRes,
          mockNext,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('EC-002: unknown subdomain blocking', () => {
    it('should throw BadRequestException when no subdomain can be resolved', async () => {
      await expect(
        middleware.use(
          createMockReq({
            headers: { host: 'localhost:3000' },
          }),
          mockRes,
          mockNext,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when subdomain has no matching company', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(null);

      await expect(
        middleware.use(
          createMockReq({
            headers: { host: 'unknown.odiseo.com' },
          }),
          mockRes,
          mockNext,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('subscription status enforcement', () => {
    it('should throw ForbiddenException when the company is SUSPENDED', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue({
        ...mockCompany,
        status: 'SUSPENDED',
      });

      await expect(
        middleware.use(createMockReq(), mockRes, mockNext),
      ).rejects.toThrow(ForbiddenException);

      expect(mockCls.set).not.toHaveBeenCalledWith(
        'tenantSchema',
        'tenant_uuid-company-A',
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow a company in GRACE_PERIOD to resolve', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue({
        ...mockCompany,
        status: 'GRACE_PERIOD',
      });

      await middleware.use(createMockReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('CLS context setting', () => {
    it('should set tenantSchema correctly for a valid company', async () => {
      mockTenantsService.findBySubdomain.mockResolvedValue(mockCompany);

      await middleware.use(createMockReq(), mockRes, mockNext);

      expect(mockCls.set).toHaveBeenCalledWith(
        'tenantSchema',
        'tenant_uuid-company-A',
      );
      expect(mockCls.set).toHaveBeenCalledWith('companyId', 'uuid-company-A');
    });
  });
});
