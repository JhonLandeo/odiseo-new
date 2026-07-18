import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CatalogCronService } from './catalog.cron';
import { ICatalogRepository } from './repositories/i-catalog.repository';

describe('CatalogCronService', () => {
  let service: CatalogCronService;
  let repository: ICatalogRepository;
  let httpService: HttpService;

  beforeEach(async () => {
    const mockRepository = {
      upsertCatalogs: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000/api/catalogs'),
    };

    const mockCacheManager = {
      set: jest.fn().mockResolvedValue(undefined),
    };

    const mockHttpService = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogCronService,
        {
          provide: ICatalogRepository,
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: HttpService,
          useValue: mockHttpService,
        },
      ],
    }).compile();

    service = module.get<CatalogCronService>(CatalogCronService);
    repository = module.get<ICatalogRepository>(ICatalogRepository);
    httpService = module.get<HttpService>(HttpService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fetch data from Core API and upsert via repository', async () => {
    const mockResponse = {
      data: {
        courses: [{ id: '1', name: 'Course 1', topics: [] }],
      },
    };
    jest.spyOn(httpService, 'get').mockReturnValue(of(mockResponse as any));

    await service.syncCatalogs();

    expect(httpService.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
    );
    expect(repository.upsertCatalogs).toHaveBeenCalledWith(expect.any(Object));
  });

  it('should log an error if Core API fails', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(throwError(() => new Error('Internal Server Error')));

    const loggerSpy = jest.spyOn(service['logger'], 'error');

    await service.syncCatalogs();

    expect(repository.upsertCatalogs).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error during catalog sync'),
      expect.any(String),
    );
  });
});
