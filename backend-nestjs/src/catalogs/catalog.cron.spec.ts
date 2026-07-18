import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { CatalogCronService } from './catalog.cron';
import { ICatalogRepository } from './repositories/i-catalog.repository';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';

describe('CatalogCronService', () => {
  let service: CatalogCronService;
  let repository: any;
  let httpService: HttpService;
  let lock: any;

  beforeEach(async () => {
    // Backoff is real time; collapse it so the retry tests stay fast.
    jest
      .spyOn(CatalogCronService.prototype as any, 'delay')
      .mockResolvedValue(undefined);

    const mockRepository = {
      upsertCatalogs: jest.fn(),
      recordSyncAttempt: jest.fn().mockResolvedValue(undefined),
      recordSyncSuccess: jest.fn().mockResolvedValue(undefined),
      recordSyncFailure: jest.fn().mockResolvedValue(undefined),
      getSyncState: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:3000/api/catalogs'),
    };

    const mockHttpService = {
      get: jest.fn(),
    };

    // Default: this replica wins the lock, so the existing behavioral tests
    // still exercise the real sync body.
    const mockLock = {
      tryAcquire: jest.fn().mockResolvedValue(true),
      runExclusively: jest.fn((_key, _ttl, work: () => Promise<any>) => work()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CatalogCronService,
        {
          provide: DISTRIBUTED_LOCK,
          useValue: mockLock,
        },
        {
          provide: ICatalogRepository,
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
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
    lock = module.get(DISTRIBUTED_LOCK);
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  it('records attempt and success in the durable sync state', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(of({ data: { courses: [] } } as any));

    await service.syncCatalogs();

    expect(repository.recordSyncAttempt).toHaveBeenCalledTimes(1);
    expect(repository.recordSyncSuccess).toHaveBeenCalledTimes(1);
    expect(repository.recordSyncFailure).not.toHaveBeenCalled();
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
      expect.anything(),
    );
  });

  it('retries with backoff before giving up, then records the failure', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(throwError(() => new Error('upstream down')));

    await service.syncCatalogs();

    // Bounded retry: three attempts per scheduled run, then stop. The hourly
    // schedule is the outer loop.
    expect(httpService.get).toHaveBeenCalledTimes(3);
    expect(service['delay']).toHaveBeenCalledTimes(2);
    expect(service['delay']).toHaveBeenNthCalledWith(1, 1000);
    expect(service['delay']).toHaveBeenNthCalledWith(2, 2000);

    // The outage is persisted, not merely logged: this is the only way an
    // operator sees a sync that has been dead for weeks.
    expect(repository.recordSyncFailure).toHaveBeenCalledWith('upstream down');
    expect(repository.recordSyncSuccess).not.toHaveBeenCalled();
  });

  it('succeeds without recording a failure when a retry recovers', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValueOnce(throwError(() => new Error('transient')))
      .mockReturnValueOnce(of({ data: { courses: [] } } as any));

    await service.syncCatalogs();

    expect(httpService.get).toHaveBeenCalledTimes(2);
    expect(repository.recordSyncSuccess).toHaveBeenCalledTimes(1);
    expect(repository.recordSyncFailure).not.toHaveBeenCalled();
  });

  it('treats an invalid payload as a failed sync', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(of({ data: { nope: true } } as any));
    repository.upsertCatalogs.mockRejectedValue(
      new Error('Invalid catalog payload from Core API: "courses" is missing'),
    );

    await service.syncCatalogs();

    expect(repository.recordSyncFailure).toHaveBeenCalledWith(
      expect.stringContaining('Invalid catalog payload'),
    );
    expect(repository.recordSyncSuccess).not.toHaveBeenCalled();
  });

  it('still reports success when the bookkeeping write fails', async () => {
    jest
      .spyOn(httpService, 'get')
      .mockReturnValue(of({ data: { courses: [] } } as any));
    repository.recordSyncSuccess.mockRejectedValue(new Error('db down'));

    // A failed status write must not turn a successful catalog sync into a
    // failure — nor throw out of the cron.
    await expect(service.syncCatalogs()).resolves.toBeUndefined();
    expect(repository.recordSyncFailure).not.toHaveBeenCalled();
  });

  // @Cron fires in every replica; without exclusion the external Core API is
  // hit N times an hour and N writers race on the same upserts.
  describe('distributed lock', () => {
    it('guards the whole run behind a job-specific lock', async () => {
      jest
        .spyOn(httpService, 'get')
        .mockReturnValue(of({ data: { courses: [] } } as any));

      await service.syncCatalogs();

      expect(lock.runExclusively).toHaveBeenCalledWith(
        'cron:catalogs:sync',
        expect.any(Number),
        expect.any(Function),
      );
      // TTL must outlast a run but expire well inside the hourly interval.
      const ttl = lock.runExclusively.mock.calls[0][1];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThan(60 * 60 * 1000);
    });

    it('does no work at all when another replica holds the lock', async () => {
      lock.runExclusively.mockResolvedValue(undefined);
      jest.spyOn(httpService, 'get');

      await expect(service.syncCatalogs()).resolves.toBeUndefined();

      expect(httpService.get).not.toHaveBeenCalled();
      expect(repository.recordSyncAttempt).not.toHaveBeenCalled();
      expect(repository.upsertCatalogs).not.toHaveBeenCalled();
    });
  });
});
