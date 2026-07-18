import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TenantMiddleware } from './tenant.middleware';
import { Company } from '../tenants/entities/tenant.entity';

describe('TenantMiddleware', () => {
  let middleware: TenantMiddleware;
  let mockCls: any;
  let mockCompanyRepo: any;

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

    mockCompanyRepo = {
      findOne: jest.fn(),
    };

    middleware = new TenantMiddleware(mockCls, mockCompanyRepo);
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
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);

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
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);

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
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);

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

      expect(mockCompanyRepo.findOne).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip tenant resolution for admin companies endpoint', async () => {
      await middleware.use(
        createMockReq({
          headers: { host: 'localhost:3000' },
          path: '/api/v1/admin/companies',
        }),
        mockRes,
        mockNext,
      );

      expect(mockCompanyRepo.findOne).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
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
      mockCompanyRepo.findOne.mockResolvedValue(null);

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
      mockCompanyRepo.findOne.mockResolvedValue({
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
      mockCompanyRepo.findOne.mockResolvedValue({
        ...mockCompany,
        status: 'GRACE_PERIOD',
      });

      await middleware.use(createMockReq(), mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('CLS context setting', () => {
    it('should set tenantSchema correctly for a valid company', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(mockCompany);

      await middleware.use(createMockReq(), mockRes, mockNext);

      expect(mockCls.set).toHaveBeenCalledWith(
        'tenantSchema',
        'tenant_uuid-company-A',
      );
      expect(mockCls.set).toHaveBeenCalledWith('companyId', 'uuid-company-A');
    });
  });
});
