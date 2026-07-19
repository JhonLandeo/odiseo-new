import { QuestionBankService } from './question-bank.service';

// FlatQuestionsRepository owns every raw-SQL query against `odiseo.*`; these
// tests only verify QuestionBankService delegates to it correctly. SQL-shape
// coverage (bounded pool tiers, EXISTS, subtopic mappings) lives in
// flat-questions.repository.spec.ts, next to the queries themselves.
describe('QuestionBankService', () => {
  const makeService = (questionRepo: any = {}, flatQuestionsRepo: any = {}) =>
    new QuestionBankService(questionRepo, flatQuestionsRepo);

  describe('getQuestionsByIds', () => {
    it('short-circuits to [] for empty input without querying', async () => {
      const find = jest.fn();
      const service = makeService({ find });

      await expect(service.getQuestionsByIds([])).resolves.toEqual([]);
      expect(find).not.toHaveBeenCalled();
    });

    it('loads questions with their alternatives for the given ids', async () => {
      const rows = [{ id: '1' }];
      const find = jest.fn().mockResolvedValue(rows);
      const service = makeService({ find });

      const result = await service.getQuestionsByIds(['1', '2']);

      expect(result).toBe(rows);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ relations: ['alternatives'] }),
      );
    });
  });

  describe('getSubtopicQuestionMappings', () => {
    it('delegates to FlatQuestionsRepository.findSubtopicQuestionMappings', async () => {
      const rows = [{ questionId: '1', subtopicId: '10' }];
      const findSubtopicQuestionMappings = jest.fn().mockResolvedValue(rows);
      const service = makeService({}, { findSubtopicQuestionMappings });

      const result = await service.getSubtopicQuestionMappings([10, 20]);

      expect(result).toBe(rows);
      expect(findSubtopicQuestionMappings).toHaveBeenCalledWith([10, 20]);
    });
  });
});

// ───────────────────── B1: bounded candidate pool ─────────────────
describe('QuestionBankService.getRandomQuestions pool bounding', () => {
  const makeDeps = (poolRows: Array<{ id: string; levelId: number }> = []) => {
    const findBoundedCandidatePool = jest.fn().mockResolvedValue(poolRows);
    const find = jest.fn().mockResolvedValue([]);
    return {
      questionRepo: { find },
      flatQuestionsRepo: { findBoundedCandidatePool },
      find,
      findBoundedCandidatePool,
    };
  };

  it('delegates pool loading to FlatQuestionsRepository.findBoundedCandidatePool with the exact call args', async () => {
    const { questionRepo, flatQuestionsRepo, findBoundedCandidatePool } =
      makeDeps();
    const service = new QuestionBankService(
      questionRepo as any,
      flatQuestionsRepo as any,
    );

    await service.getRandomQuestions('42', 5, ['7'], 'EASY');

    expect(findBoundedCandidatePool).toHaveBeenCalledWith(42, 5, ['7'], 'EASY');
  });

  it('short-circuits without querying the pool for a non-positive limit', async () => {
    const { questionRepo, flatQuestionsRepo, findBoundedCandidatePool } =
      makeDeps();
    const service = new QuestionBankService(
      questionRepo as any,
      flatQuestionsRepo as any,
    );

    await expect(service.getRandomQuestions('42', 0)).resolves.toEqual([]);
    expect(findBoundedCandidatePool).not.toHaveBeenCalled();
  });

  it('returns [] without a second query when the pool is empty', async () => {
    const { questionRepo, flatQuestionsRepo, find } = makeDeps([]);
    const service = new QuestionBankService(
      questionRepo as any,
      flatQuestionsRepo as any,
    );

    await expect(service.getRandomQuestions('42', 3)).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('hydrates the selected questions with their alternatives', async () => {
    const { questionRepo, flatQuestionsRepo, find } = makeDeps([
      { id: '1', levelId: 10 },
      { id: '2', levelId: 20 },
    ]);
    const service = new QuestionBankService(
      questionRepo as any,
      flatQuestionsRepo as any,
    );

    await service.getRandomQuestions('42', 2);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: ['alternatives'] }),
    );
  });
});
