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
});
