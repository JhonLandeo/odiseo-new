import { TopicIdSpaceReconciliationService } from './topic-id-space-reconciliation.service';

describe('TopicIdSpaceReconciliationService', () => {
  const makeService = (coreIds: string[], bankIds: string[]) => {
    const defaultManager = {
      query: jest.fn().mockResolvedValue(coreIds.map((id) => ({ id }))),
    };
    const questionsManager = {
      query: jest.fn().mockResolvedValue(bankIds.map((id) => ({ id }))),
    };
    const service = new TopicIdSpaceReconciliationService(
      defaultManager as any,
      questionsManager as any,
    );
    return { service, defaultManager, questionsManager };
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries public.topics on the default connection and odiseo.topic on questionsConnection', async () => {
    const { service, defaultManager, questionsManager } = makeService(
      ['1', '2'],
      ['1', '2'],
    );

    await service.checkOverlap();

    expect(defaultManager.query).toHaveBeenCalledWith(
      'SELECT DISTINCT id FROM public.topics',
    );
    expect(questionsManager.query).toHaveBeenCalledWith(
      'SELECT DISTINCT id FROM odiseo.topic',
    );
  });

  it('computes a 1.0 ratio and logs nothing when every core topic exists in the bank', async () => {
    const { service } = makeService(['1', '2', '3', '4'], ['1', '2', '3', '4']);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkOverlap();

    expect(result).toEqual({
      totalCoreTopics: 4,
      overlappingTopics: 4,
      overlapRatio: 1,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log when the overlap ratio is exactly at the 95% threshold', async () => {
    // 19/20 = 95% exactly, at the threshold: not BELOW it.
    const coreIds = Array.from({ length: 20 }, (_, i) => String(i + 1));
    const bankIds = coreIds.slice(0, 19);
    const { service } = makeService(coreIds, bankIds);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkOverlap();

    expect(result.overlapRatio).toBeCloseTo(0.95);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a Logger.error with the actual counts when the overlap ratio falls below 95%', async () => {
    // 8/10 = 80%, well below the threshold: this is the disjoint-id-space
    // failure mode the check exists to catch.
    const coreIds = Array.from({ length: 10 }, (_, i) => String(i + 1));
    const bankIds = coreIds.slice(0, 8);
    const { service } = makeService(coreIds, bankIds);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkOverlap();

    expect(result).toEqual({
      totalCoreTopics: 10,
      overlappingTopics: 8,
      overlapRatio: 0.8,
    });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('8/10'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('80.00%'));
  });

  it('never throws on a low ratio — this is an observability check, not a request-path gate', async () => {
    const coreIds = ['1', '2', '3'];
    const { service } = makeService(coreIds, []);

    await expect(service.checkOverlap()).resolves.toEqual({
      totalCoreTopics: 3,
      overlappingTopics: 0,
      overlapRatio: 0,
    });
  });

  it('treats zero core topics as fully consistent instead of dividing by zero', async () => {
    const { service } = makeService([], []);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkOverlap();

    expect(result).toEqual({
      totalCoreTopics: 0,
      overlappingTopics: 0,
      overlapRatio: 1,
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
