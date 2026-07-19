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

  it('orders the alternatives json_agg by id, so Postgres never returns them unordered', async () => {
    const { repo, query } = makeRepo();
    await repo.findByIdsFromNormalized(['1']);
    const [sql] = query.mock.calls[0];
    expect(sql).toMatch(
      /json_agg\(json_build_object\([^)]*\)\s*ORDER BY a\.id\)/,
    );
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

  it('sorts alternatives by id before assigning display letters, regardless of arrival order', async () => {
    // Rows arrive genuinely shuffled (id 30, then 10, then 20) — not the
    // pre-sorted order the other fixtures use — so this actually exercises the
    // sort instead of coincidentally passing.
    const { repo } = makeRepo([
      {
        question_id: '8',
        code: 'Q8',
        level_id: 1,
        level_name: 'Easy',
        type: 'single',
        html_content: '<p>?</p>',
        alternatives: [
          { id: '30', description: 'third', is_correct: false },
          { id: '10', description: 'first', is_correct: false },
          { id: '20', description: 'second', is_correct: true },
        ],
        images: null,
      },
    ]);

    const [q] = await repo.findByIdsFromNormalized(['8']);

    expect(q.alternatives).toEqual([
      { id: '10', label: 'A', text: 'first', is_correct: false },
      { id: '20', label: 'B', text: 'second', is_correct: true },
      { id: '30', label: 'C', text: 'third', is_correct: false },
    ]);
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
      q.alternatives!.map((a: any) => ({
        label: a.label,
        isCorrect: a.is_correct,
      })),
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
      q.alternatives!.map((a: any) => ({
        label: a.label,
        isCorrect: a.is_correct,
      })),
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

  it('drops non-numeric ids from a malformed courseId list instead of binding NaN', async () => {
    const { repo, query } = makeRepo();

    await repo.searchQuestionIds({ courseId: '1,abc', limit: 4 });

    const [sql, params] = query.mock.calls[0];
    // Only the one valid id ('1') survives — NaN never reaches params.
    expect(params.some((p: unknown) => Number.isNaN(p))).toBe(false);
    expect(sql).toContain('t.course_id IN ($1)');
    expect(params).toEqual([1, 12]);
  });

  it('drops non-numeric ids from a malformed subtopicId/topicId list instead of binding NaN', async () => {
    const { repo: repoSub, query: querySub } = makeRepo();
    await repoSub.searchQuestionIds({ subtopicId: 'abc,2', limit: 4 });
    expect(querySub.mock.calls[0][1]).toEqual([2, 12]);

    const { repo: repoTopic, query: queryTopic } = makeRepo();
    await repoTopic.searchQuestionIds({ topicId: 'xyz', limit: 4 });
    const [sql, params] = queryTopic.mock.calls[0];
    // No valid ids at all -> the whole IN-clause is skipped, only LIMIT binds.
    expect(sql).not.toContain('topic_id IN');
    expect(params).toEqual([12]);
  });
});

describe('FlatQuestionsRepository.findBoundedCandidatePool (bounded pool sampling)', () => {
  it('bounds the pool in SQL instead of loading the whole subtopic', async () => {
    const { repo, query } = makeRepo();

    await repo.findBoundedCandidatePool(42, 5, [], 'EASY');

    const [sql, params] = query.mock.calls[0];
    // Every tier is bounded; nothing streams the full subtopic into Node.
    expect(sql).toContain('LIMIT $3');
    // 3 tiers x (limit * POOL_OVERSAMPLE=3) => 15 rows per tier.
    expect(params[2]).toBe(15);
    expect(params[0]).toBe(42);
  });

  it('samples per fallback tier so difficulty and recycling stay satisfiable', async () => {
    const { repo, query } = makeRepo();

    await repo.findBoundedCandidatePool(42, 5, ['7'], 'EASY');

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

    await repo.findBoundedCandidatePool(42, 5, []);

    const [sql] = query.mock.calls[0];
    // Without a difficulty the level tier would duplicate the "any unused" one.
    expect(sql.split('UNION')).toHaveLength(2);
    expect(sql).not.toContain('level_id = ANY');
  });

  it('uses EXISTS rather than IN (SELECT ...) against the flat_questions view', async () => {
    const { repo, query } = makeRepo();

    await repo.findBoundedCandidatePool(42, 5, []);

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

    await repo.findBoundedCandidatePool(42, 2, ['1', 'not-a-number', '3']);

    expect(query.mock.calls[0][1][1]).toEqual([1, 3]);
  });

  it('maps raw {id, level_id} rows to the {id, levelId} projection', async () => {
    const { repo } = makeRepo([
      { id: '1', level_id: 10 },
      { id: '2', level_id: 20 },
    ]);

    const pool = await repo.findBoundedCandidatePool(42, 2, []);

    expect(pool).toEqual([
      { id: '1', levelId: 10 },
      { id: '2', levelId: 20 },
    ]);
  });
});

describe('FlatQuestionsRepository.findSubtopicQuestionMappings', () => {
  it('short-circuits to [] for empty input without querying', async () => {
    const { repo, query } = makeRepo();
    await expect(repo.findSubtopicQuestionMappings([])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('queries question_subtopic for the given subtopic ids, unbounded on result size', async () => {
    const rows = [{ questionId: '1', subtopicId: '10' }];
    const { repo, query } = makeRepo(rows);

    const result = await repo.findSubtopicQuestionMappings([10, 20]);

    expect(result).toBe(rows);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('odiseo.question_subtopic');
    expect(sql).not.toMatch(/LIMIT/i);
    expect(params).toEqual([[10, 20]]);
  });
});
