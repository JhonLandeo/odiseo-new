import { TenantsService } from './tenants.service';
import { Company } from './entities/tenant.entity';

describe('TenantsService', () => {
  let service: TenantsService;
  let mockCompanyRepo: any;
  let mockDataSource: any;

  const mockSavedCompany: Partial<Company> = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    subdomain: 'nuevo-colegio',
    commercialName: 'Colegio Nuevo',
    logoUrl: undefined,
    primaryColor: '#6366f1',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockCompanyRepo = {
      findOne: jest.fn(),
    };

    mockDataSource = {};

    service = new TenantsService(mockCompanyRepo, mockDataSource);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findBySubdomain', () => {
    it('should return company for valid subdomain', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(mockSavedCompany);

      const result = await service.findBySubdomain('nuevo-colegio');

      expect(result).toEqual(mockSavedCompany);
      expect(mockCompanyRepo.findOne).toHaveBeenCalledWith({
        where: { subdomain: 'nuevo-colegio', isActive: true },
      });
    });

    it('should return null for unknown subdomain', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(null);

      const result = await service.findBySubdomain('nonexistent');

      expect(result).toBeNull();
    });
  });
  describe('getBranding', () => {
    const defaultBranding = {
      commercialName: 'Odiseo B2B Default',
      logoUrl: null,
      primaryColor: '#6366f1',
    };

    it('should return default branding if subdomain is empty', async () => {
      const result = await service.getBranding('');
      expect(result).toEqual(defaultBranding);
      expect(mockCompanyRepo.findOne).not.toHaveBeenCalled();
    });

    it('should return default branding if company is not found', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(null);
      const result = await service.getBranding('unknown');
      expect(result).toEqual(defaultBranding);
    });

    it('should return company branding if found', async () => {
      mockCompanyRepo.findOne.mockResolvedValue({
        commercialName: 'Custom Company',
        logoUrl: 'https://logo.com',
        primaryColor: '#000000',
      });
      const result = await service.getBranding('custom');
      expect(result).toEqual({
        commercialName: 'Custom Company',
        logoUrl: 'https://logo.com',
        primaryColor: '#000000',
      });
    });
  });
});
