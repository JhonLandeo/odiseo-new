import { Logger } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { Company } from './entities/tenant.entity';

describe('TenantsService', () => {
  let service: TenantsService;
  let mockCompanyRepo: any;
  let mockDataSource: any;
  let mockCacheManager: any;

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

    mockCacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(undefined),
    };

    service = new TenantsService(
      mockCompanyRepo,
      mockDataSource,
      mockCacheManager,
    );
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

  // The lookup backs TenantMiddleware on every tenant-scoped request, so it is
  // served from a short-TTL Redis cache with explicit invalidation on company
  // mutations, degrading to Postgres on any cache failure.
  describe('findBySubdomain cache', () => {
    const CACHE_KEY = 'company:subdomain:nuevo-colegio';

    it('serves a cache hit without touching the database', async () => {
      mockCacheManager.get.mockResolvedValue(mockSavedCompany);

      const result = await service.findBySubdomain('nuevo-colegio');

      expect(result).toEqual(mockSavedCompany);
      expect(mockCompanyRepo.findOne).not.toHaveBeenCalled();
    });

    it('populates the cache on a miss', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(mockSavedCompany);

      await service.findBySubdomain('nuevo-colegio');

      expect(mockCacheManager.set).toHaveBeenCalledWith(
        CACHE_KEY,
        mockSavedCompany,
        expect.any(Number),
      );
      const ttl = mockCacheManager.set.mock.calls[0][2];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60_000);
    });

    it('does not cache a negative lookup', async () => {
      mockCompanyRepo.findOne.mockResolvedValue(null);

      const result = await service.findBySubdomain('nonexistent');

      expect(result).toBeNull();
      expect(mockCacheManager.set).not.toHaveBeenCalled();
    });

    it('still resolves via the database when the cache read rejects', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockCacheManager.get.mockRejectedValue(
        new Error('Redis connection refused'),
      );
      mockCompanyRepo.findOne.mockResolvedValue(mockSavedCompany);

      const result = await service.findBySubdomain('nuevo-colegio');

      expect(result).toEqual(mockSavedCompany);
      expect(mockCompanyRepo.findOne).toHaveBeenCalled();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('still returns the company when the cache write rejects', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockCacheManager.set.mockRejectedValue(new Error('write timed out'));
      mockCompanyRepo.findOne.mockResolvedValue(mockSavedCompany);

      const result = await service.findBySubdomain('nuevo-colegio');

      expect(result).toEqual(mockSavedCompany);
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    describe('when the cache read hangs', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('times out and degrades to the database instead of hanging', async () => {
        const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
        mockCacheManager.get.mockReturnValue(new Promise<never>(() => {}));
        mockCompanyRepo.findOne.mockResolvedValue(mockSavedCompany);

        const pending = service.findBySubdomain('nuevo-colegio');
        await jest.advanceTimersByTimeAsync(1000);
        const result = await pending;

        expect(result).toEqual(mockSavedCompany);
        expect(mockCompanyRepo.findOne).toHaveBeenCalled();
        expect(String(warn.mock.calls[0][0])).toContain('timed out');
        warn.mockRestore();
      });
    });
  });

  describe('invalidateSubdomainCache', () => {
    it('drops the cached company row', async () => {
      await service.invalidateSubdomainCache('nuevo-colegio');

      expect(mockCacheManager.del).toHaveBeenCalledWith(
        'company:subdomain:nuevo-colegio',
      );
    });

    it('logs and swallows a cache failure instead of throwing', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      mockCacheManager.del.mockRejectedValue(new Error('Redis down'));

      await expect(
        service.invalidateSubdomainCache('nuevo-colegio'),
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
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
