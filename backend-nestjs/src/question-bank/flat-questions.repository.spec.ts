import { FlatQuestionsRepository } from './flat-questions.repository';
import { resolveAnswerKeyLetter } from '../materials/services/pdf-generator.service';

// Mock the EntityManager the way question-bank.service.spec mocks its repo:
// a bare object exposing only the `query` method the repository actually calls.
const makeRepo = (rows: any[] = []) => {
  const query = jest.fn().mockResolvedValue(rows);
  const repo = new FlatQuestionsRepository({ query } as any);
  return { repo, query };
};

describe('FlatQuestionsRepository.findByIdsFromNormalized (answer_id derivation)', () => {
  it('short-circuits to [] for empty input without querying', async () => {
    const { repo, query } = makeRepo();
    await expect(repo.findByIdsFromNormalized([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('derives correctness in SQL as `a.id = q.answer_id`', async () => {
    const { repo, query } = makeRepo();
    await repo.findByIdsFromNormalized(['1']);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('a.id = q.answer_id');
  });

  it('maps alternatives to A/B/C labels by order and passes is_correct through', async () => {
    const { repo } = makeRepo([
      {
        question_id: '5',
        code: 'Q5',
        level_id: 1,
        level_name: 'Easy',
        type: 'single',
        html_content: '<p>?</p>',
        alternatives: [
          { id: '10', description: 'first', is_correct: false },
          { id: '20', description: 'second', is_correct: true },
          { id: '30', description: 'third', is_correct: false },
        ],
        images: null,
      },
    ]);

    const [q] = await repo.findByIdsFromNormalized(['5']);

    expect(q.alternatives).toEqual([
      { id: '10', label: 'A', text: 'first', is_correct: false },
      { id: '20', label: 'B', text: 'second', is_correct: true },
      { id: '30', label: 'C', text: 'third', is_correct: false },
    ]);
    expect(q.solution).toBeNull();
    expect(q.images).toEqual([]);
  });

  it('propagates a zero-correct row so detection flags it (answer_id matched nothing)', async () => {
    const { repo } = makeRepo([
      {
        question_id: '6',
        alternatives: [
          { id: '10', description: 'a', is_correct: false },
          { id: '20', description: 'b', is_correct: false },
        ],
      },
    ]);

    const [q] = await repo.findByIdsFromNormalized(['6']);

    expect(q.alternatives!.every((a: any) => !a.is_correct)).toBe(true);

    const logger = { warn: jest.fn() };
    const key = resolveAnswerKeyLetter(
      q.alternatives!.map((a: any) => ({ label: a.label, isCorrect: a.is_correct })),
      String(q.question_id),
      logger,
    );
    expect(key).toBe('-');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('propagates a many-correct row so detection flags the ambiguity', async () => {
    const { repo } = makeRepo([
      {
        question_id: '7',
        alternatives: [
          { id: '10', description: 'a', is_correct: true },
          { id: '20', description: 'b', is_correct: true },
        ],
      },
    ]);

    const [q] = await repo.findByIdsFromNormalized(['7']);

    expect(q.alternatives!.filter((a: any) => a.is_correct)).toHaveLength(2);

    const logger = { warn: jest.fn() };
    const key = resolveAnswerKeyLetter(
      q.alternatives!.map((a: any) => ({ label: a.label, isCorrect: a.is_correct })),
      String(q.question_id),
      logger,
    );
    expect(key).toBe('-');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe('FlatQuestionsRepository.searchQuestionIds (bounded result set)', () => {
  it('appends a parameterized LIMIT sized as limit * oversample (never interpolated)', async () => {
    const { repo, query } = makeRepo();

    await repo.searchQuestionIds({ courseId: '10', limit: 5 });

    const [sql, params] = query.mock.calls[0];
    // The LIMIT must be a bound parameter placeholder, not an inline literal.
    expect(sql).toMatch(/ORDER BY random\(\) LIMIT \$\d+\s*$/);
    expect(sql).not.toMatch(/LIMIT\s+\d+/);
    // Bound value = limit (5) * SEARCH_OVERSAMPLE (3) = 15, last param.
    expect(params[params.length - 1]).toBe(15);
  });

  it('binds the LIMIT placeholder right after the filter params', async () => {
    const { repo, query } = makeRepo();

    // courseId '1,2' contributes two filter params before the LIMIT param.
    await repo.searchQuestionIds({ courseId: '1,2', limit: 4 });

    const [sql, params] = query.mock.calls[0];
    // Two course ids -> $1,$2 ; the LIMIT must therefore bind $3.
    expect(sql).toContain('LIMIT $3');
    expect(params).toEqual([1, 2, 12]);
  });

  it('falls back to a bounded default LIMIT when no limit is provided', async () => {
    const { repo, query } = makeRepo();

    await repo.searchQuestionIds({ courseId: '10' });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY random\(\) LIMIT \$\d+\s*$/);
    // DEFAULT_SEARCH_LIMIT (25) * SEARCH_OVERSAMPLE (3) = 75.
    expect(params[params.length - 1]).toBe(75);
  });

  it('leaves the happy path unchanged: fewer rows than the bound are all returned', async () => {
    // Two rows come back, well under the bound; every id is mapped through.
    const { repo } = makeRepo([{ question_id: 101 }, { question_id: 202 }]);

    const ids = await repo.searchQuestionIds({ courseId: '10', limit: 25 });

    expect(ids).toEqual(['101', '202']);
  });
});
