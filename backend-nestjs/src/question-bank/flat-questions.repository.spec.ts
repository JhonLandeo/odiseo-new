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
