import { Test, TestingModule } from '@nestjs/testing';
import { TopicIdSpaceCronService } from './topic-id-space.cron';
import { TopicIdSpaceReconciliationService } from './topic-id-space-reconciliation.service';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';

describe('TopicIdSpaceCronService', () => {
  let service: TopicIdSpaceCronService;
  let reconciliationService: any;
  let lock: any;

  beforeEach(async () => {
    const mockReconciliationService = {
      checkOverlap: jest.fn().mockResolvedValue({
        totalCoreTopics: 10,
        overlappingTopics: 10,
        overlapRatio: 1,
      }),
    };

    // Default: this replica wins the lock, so the behavioral tests exercise
    // the real check.
    const mockLock = {
      tryAcquire: jest.fn().mockResolvedValue(true),
      runExclusively: jest.fn((_key, _ttl, work: () => Promise<any>) => work()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicIdSpaceCronService,
        {
          provide: DISTRIBUTED_LOCK,
          useValue: mockLock,
        },
        {
          provide: TopicIdSpaceReconciliationService,
          useValue: mockReconciliationService,
        },
      ],
    }).compile();

    service = module.get<TopicIdSpaceCronService>(TopicIdSpaceCronService);
    reconciliationService = module.get(TopicIdSpaceReconciliationService);
    lock = module.get(DISTRIBUTED_LOCK);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('runs the overlap check when it wins the lock', async () => {
    await service.checkTopicIdSpace();

    expect(reconciliationService.checkOverlap).toHaveBeenCalledTimes(1);
  });

  // @Cron fires in every replica; without exclusion N replicas would run the
  // same two-database scan concurrently for no benefit.
  describe('distributed lock', () => {
    it('guards the whole run behind a job-specific lock', async () => {
      await service.checkTopicIdSpace();

      expect(lock.runExclusively).toHaveBeenCalledWith(
        'cron:catalogs:topic-id-space-check',
        expect.any(Number),
        expect.any(Function),
      );
      // TTL must outlast a run but expire well inside the daily interval.
      const ttl = lock.runExclusively.mock.calls[0][1];
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThan(24 * 60 * 60 * 1000);
    });

    it('does no work at all when another replica holds the lock', async () => {
      lock.runExclusively.mockResolvedValue(undefined);

      await expect(service.checkTopicIdSpace()).resolves.toBeUndefined();

      expect(reconciliationService.checkOverlap).not.toHaveBeenCalled();
    });
  });

  it('does not throw when the check itself fails (e.g. a connection outage)', async () => {
    reconciliationService.checkOverlap.mockRejectedValue(
      new Error('connection refused'),
    );
    const loggerSpy = jest.spyOn(service['logger'], 'error');

    await expect(service.checkTopicIdSpace()).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Topic id-space check failed to run'),
      expect.anything(),
    );
  });
});
