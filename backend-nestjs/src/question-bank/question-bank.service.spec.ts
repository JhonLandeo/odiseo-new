import { QuestionBankService } from './question-bank.service';

describe('QuestionBankService', () => {
  const makeService = (questionRepo: any = {}) =>
    new QuestionBankService(questionRepo);

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
    it('short-circuits to [] for empty input', async () => {
      const service = makeService({ manager: {} });
      await expect(service.getSubtopicQuestionMappings([])).resolves.toEqual(
        [],
      );
    });
  });
});

// ───────────────────── B1: bounded candidate pool ─────────────────
describe('QuestionBankService.getRandomQuestions pool bounding', () => {
  const makeRepo = (poolRows: any[] = []) => {
    const query = jest.fn().mockResolvedValue(poolRows);
    const find = jest.fn().mockResolvedValue([]);
    return { repo: { manager: { query }, find }, query, find };
  };

  it('bounds the pool in SQL instead of loading the whole subtopic', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 5, [], 'EASY');

    const [sql, params] = query.mock.calls[0];
    // Every tier is bounded; nothing streams the full subtopic into Node.
    expect(sql).toContain('LIMIT $3');
    // 3 tiers x (limit * POOL_OVERSAMPLE=3) => 15 rows per tier.
    expect(params[2]).toBe(15);
    expect(params[0]).toBe(42);
  });

  it('samples per fallback tier so difficulty and recycling stay satisfiable', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 5, ['7'], 'EASY');

    const [sql] = query.mock.calls[0];
    const tiers = sql.split('UNION');
    // matching-level unused, any unused, recycled.
    expect(tiers).toHaveLength(3);
    expect(tiers[0]).toContain('q.level_id = ANY($4::int[])');
    expect(tiers[0]).toContain('NOT (q.id = ANY($2::bigint[]))');
    expect(tiers[2]).toContain('q.id = ANY($2::bigint[])');
  });

  it('drops the level tier when no difficulty is requested', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 5);

    const [sql] = query.mock.calls[0];
    // Without a difficulty the level tier would duplicate the "any unused" one.
    expect(sql.split('UNION')).toHaveLength(2);
    expect(sql).not.toContain('level_id = ANY');
  });

  it('uses EXISTS rather than IN (SELECT ...) against the flat_questions view', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 5);

    const [sql] = query.mock.calls[0];
    expect(sql).toContain('EXISTS');
    expect(sql).not.toContain(
      'IN (SELECT question_id FROM odiseo.flat_questions)',
    );
    // question_subtopic becomes the driving relation via a join.
    expect(sql).toContain('INNER JOIN odiseo.question_subtopic');
  });

  it('passes exclusions to SQL as a numeric array, ignoring junk ids', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 2, ['1', 'not-a-number', '3']);

    expect(query.mock.calls[0][1][1]).toEqual([1, 3]);
  });

  it('short-circuits without querying for a non-positive limit', async () => {
    const { repo, query } = makeRepo();
    const service = new QuestionBankService(repo as any);

    await expect(service.getRandomQuestions('42', 0)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('returns [] without a second query when the pool is empty', async () => {
    const { repo, find } = makeRepo([]);
    const service = new QuestionBankService(repo as any);

    await expect(service.getRandomQuestions('42', 3)).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it('hydrates the selected questions with their alternatives', async () => {
    const { repo, find } = makeRepo([
      { id: '1', level_id: 10 },
      { id: '2', level_id: 20 },
    ]);
    const service = new QuestionBankService(repo as any);

    await service.getRandomQuestions('42', 2);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ relations: ['alternatives'] }),
    );
  });
});
