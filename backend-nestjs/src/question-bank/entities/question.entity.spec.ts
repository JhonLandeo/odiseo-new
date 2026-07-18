import { Question } from './question.entity';
import { Alternative } from './alternative.entity';
import { resolveAnswerKeyLetter } from '../../materials/services/pdf-generator.service';

const makeAlt = (id: string, text: string): Alternative =>
  Object.assign(new Alternative(), { id, text });

const makeQuestion = (answerId: string | null, alts: Alternative[]): Question =>
  Object.assign(new Question(), { answerId, alternatives: alts });

// Bridge the getter's derivation to the answer-key detection so we assert that a
// missing/unmatched answer_id is caught downstream, not silently keyed.
const keyFromOptions = (q: Question, logger: { warn: jest.Mock }) =>
  resolveAnswerKeyLetter(
    q.options.map((o) => ({ label: o.label, isCorrect: o.is_correct })),
    'Q-under-test',
    logger,
  );

describe('Question.options correctness derivation', () => {
  it('returns [] when the question has no alternatives loaded', () => {
    expect(makeQuestion('1', undefined as any).options).toEqual([]);
  });

  it('flags exactly one correct option for a well-formed question (happy path)', () => {
    const q = makeQuestion('20', [
      makeAlt('10', 'first'),
      makeAlt('20', 'second'),
      makeAlt('30', 'third'),
    ]);

    const opts = q.options;

    expect(opts.map((o) => o.is_correct)).toEqual([false, true, false]);

    const logger = { warn: jest.fn() };
    expect(keyFromOptions(q, logger)).toBe('B');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('assigns labels A/B/C in ascending alternative-id order regardless of input order', () => {
    const q = makeQuestion('10', [
      makeAlt('30', 'third'),
      makeAlt('10', 'first'),
      makeAlt('20', 'second'),
    ]);

    const opts = q.options;

    expect(opts.map((o) => o.label)).toEqual(['A', 'B', 'C']);
    expect(opts.map((o) => o.text)).toEqual(['first', 'second', 'third']);
    // answer_id 10 is the lowest id → label A.
    expect(opts.find((o) => o.is_correct)?.label).toBe('A');
  });

  it('flags NO correct option when answer_id is null, and detection fires', () => {
    const q = makeQuestion(null, [makeAlt('10', 'first'), makeAlt('20', 'second')]);

    expect(q.options.every((o) => !o.is_correct)).toBe(true);

    const logger = { warn: jest.fn() };
    expect(keyFromOptions(q, logger)).toBe('-');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('flags NO correct option when answer_id matches no alternative, and detection fires', () => {
    const q = makeQuestion('999', [
      makeAlt('10', 'first'),
      makeAlt('20', 'second'),
    ]);

    expect(q.options.every((o) => !o.is_correct)).toBe(true);

    const logger = { warn: jest.fn() };
    expect(keyFromOptions(q, logger)).toBe('-');
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
