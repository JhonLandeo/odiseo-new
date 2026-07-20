import { Test, TestingModule } from '@nestjs/testing';
import { QuestionLevelIdReconciliationCronService } from './question-level-id-reconciliation.cron';
import { QuestionLevelIdReconciliationService } from './question-level-id-reconciliation.service';
import { DISTRIBUTED_LOCK } from '../common/locking/distributed-lock.interface';

describe('QuestionLevelIdReconciliationCronService', () => {
  let service: QuestionLevelIdReconciliationCronService;
  let reconciliationService: any;
  let lock: any;

  beforeEach(async () => {
    const mockReconciliationService = {
      checkLevelIds: jest.fn().mockResolvedValue({
        expectedCount: 10,
        foundCount: 10,
        missingIds: [],
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
        QuestionLevelIdReconciliationCronService,
        {
          provide: DISTRIBUTED_LOCK,
          useValue: mockLock,
        },
        {
          provide: QuestionLevelIdReconciliationService,
          useValue: mockReconciliationService,
        },
      ],
    }).compile();

    service = module.get<QuestionLevelIdReconciliationCronService>(
      QuestionLevelIdReconciliationCronService,
    );
    reconciliationService = module.get(QuestionLevelIdReconciliationService);
    lock = module.get(DISTRIBUTED_LOCK);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('runs the reconciliation check when it wins the lock', async () => {
    await service.checkQuestionLevelIds();

    expect(reconciliationService.checkLevelIds).toHaveBeenCalledTimes(1);
  });

  // @Cron fires in every replica; without exclusion N replicas would run the
  // same check concurrently for no benefit.
  describe('distributed lock', () => {
    it('guards the whole run behind a job-specific lock', async () => {
      await service.checkQuestionLevelIds();

      expect(lock.runExclusively).toHaveBeenCalledWith(
        'cron:question-bank:question-level-id-check',
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

      await expect(service.checkQuestionLevelIds()).resolves.toBeUndefined();

      expect(reconciliationService.checkLevelIds).not.toHaveBeenCalled();
    });
  });

  it('does not throw when the check itself fails (e.g. a connection outage)', async () => {
    reconciliationService.checkLevelIds.mockRejectedValue(
      new Error('connection refused'),
    );
    const loggerSpy = jest.spyOn(service['logger'], 'error');

    await expect(service.checkQuestionLevelIds()).resolves.toBeUndefined();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('Question-level id check failed to run'),
      expect.anything(),
    );
  });
});
