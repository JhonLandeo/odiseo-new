import { QuestionLevelIdReconciliationService } from './question-level-id-reconciliation.service';
import { ALL_MAPPED_QUESTION_LEVEL_IDS } from './constants/question-levels.constant';

describe('QuestionLevelIdReconciliationService', () => {
  const makeService = (bankRows: Array<{ id: number; name: string }>) => {
    const questionsManager = {
      query: jest.fn().mockResolvedValue(bankRows),
    };
    const repository = {
      recordQuestionLevelReconciliation: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    const service = new QuestionLevelIdReconciliationService(
      questionsManager as any,
      repository as any,
    );
    return { service, questionsManager, repository };
  };

  const allFound = ALL_MAPPED_QUESTION_LEVEL_IDS.map((id) => ({
    id,
    name: `Level ${id}`,
  }));

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('queries odiseo.level on the questionsConnection', async () => {
    const { service, questionsManager } = makeService(allFound);

    await service.checkLevelIds();

    expect(questionsManager.query).toHaveBeenCalledWith(
      'SELECT id, name FROM odiseo.level',
    );
  });

  it('passes and logs nothing when every mapped id is found', async () => {
    const { service } = makeService(allFound);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkLevelIds();

    expect(result).toEqual({
      expectedCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
      foundCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
      missingIds: [],
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still passes when the bank has extra ids the mapping does not reference', async () => {
    const { service } = makeService([
      ...allFound,
      { id: 999, name: 'Unrelated level' },
    ]);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkLevelIds();

    expect(result.missingIds).toEqual([]);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('logs a Logger.error naming exactly which ids are missing', async () => {
    const [firstMissing, secondMissing, ...rest] =
      ALL_MAPPED_QUESTION_LEVEL_IDS;
    const bankRows = rest.map((id) => ({ id, name: `Level ${id}` }));
    const { service } = makeService(bankRows);
    const errorSpy = jest.spyOn(service['logger'], 'error');

    const result = await service.checkLevelIds();

    expect(result.missingIds.sort((a, b) => a - b)).toEqual(
      [firstMissing, secondMissing].sort((a, b) => a - b),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(String(firstMissing)),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(String(secondMissing)),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('FAILED'),
    );
  });

  it('never throws when ids are missing — this is an observability check, not a request-path gate', async () => {
    const { service } = makeService([]);

    await expect(service.checkLevelIds()).resolves.toEqual({
      expectedCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
      foundCount: 0,
      missingIds: expect.any(Array),
    });
  });

  describe('persisting the reconciliation result', () => {
    it('records a PASS with the actual counts when the check succeeds', async () => {
      const { service, repository } = makeService(allFound);

      await service.checkLevelIds();

      expect(
        repository.recordQuestionLevelReconciliation,
      ).toHaveBeenCalledWith({
        outcome: 'PASS',
        expectedCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
        foundCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
        missingIds: [],
      });
    });

    it('records a FAIL with the missing ids when the check fails', async () => {
      const { service, repository } = makeService([]);

      await service.checkLevelIds();

      expect(
        repository.recordQuestionLevelReconciliation,
      ).toHaveBeenCalledWith({
        outcome: 'FAIL',
        expectedCount: ALL_MAPPED_QUESTION_LEVEL_IDS.length,
        foundCount: 0,
        missingIds: expect.arrayContaining(ALL_MAPPED_QUESTION_LEVEL_IDS),
      });
    });

    it('does not let a persistence failure break the check or mask its result', async () => {
      const { service, repository } = makeService(allFound);
      repository.recordQuestionLevelReconciliation.mockRejectedValue(
        new Error('connection refused'),
      );
      const errorSpy = jest.spyOn(service['logger'], 'error');

      const result = await service.checkLevelIds();

      expect(result.missingIds).toEqual([]);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to persist question-level id reconciliation result',
        ),
        expect.anything(),
      );
    });

    it('does not suppress the missing-id Logger.error alert when persistence also fails', async () => {
      const { service, repository } = makeService([]);
      repository.recordQuestionLevelReconciliation.mockRejectedValue(
        new Error('connection refused'),
      );
      const errorSpy = jest.spyOn(service['logger'], 'error');

      await service.checkLevelIds();

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('FAILED'),
      );
    });
  });
});
