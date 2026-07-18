import { QuestionSelectionStrategy } from './question-selection.strategy';
import { Question } from '../entities/question.entity';

// Minimal Question-like factory — the strategy only reads id and levelId.
const q = (id: string, levelId: number): Question => ({ id, levelId } as Question);

// From question-levels.constant: EASY=[43,44], MEDIUM=[45], HARD=[46..52].
describe('QuestionSelectionStrategy.selectBestQuestions', () => {
  it('Priority 1: picks an UNUSED question matching the expected level', () => {
    const pool = [q('easy', 43), q('medium', 45)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      [],
      [{ expectedLevel: 'EASY' }],
      false,
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('easy');
  });

  it('Priority 2: falls back to an UNUSED question of any level when none match', () => {
    const pool = [q('medium', 45)]; // no HARD available
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      [],
      [{ expectedLevel: 'HARD' }],
      false,
    );
    expect(result[0]?.id).toBe('medium');
  });

  it('Priority 3: recycles a USED question only when allowRecycling is true', () => {
    const pool = [q('1', 43)];
    const recycled = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      ['1'],
      [{ expectedLevel: 'EASY' }],
      true,
    );
    expect(recycled[0]?.id).toBe('1');
  });

  it('returns null (no recycling) when the pool is exhausted and allowRecycling is false', () => {
    const pool = [q('1', 43)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      ['1'],
      [{ expectedLevel: 'EASY' }],
      false,
    );
    expect(result[0]).toBeNull();
  });

  it('never selects an excluded (used) question when unused ones exist', () => {
    const pool = [q('used', 43), q('fresh', 43)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      ['used'],
      [{ expectedLevel: 'EASY' }],
      false,
    );
    expect(result[0]?.id).toBe('fresh');
  });

  it('does not repeat a question within a single selection', () => {
    const pool = [q('a', 43), q('b', 43)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      [],
      [{ expectedLevel: 'EASY' }, { expectedLevel: 'EASY' }],
      false,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.id).not.toBe(result[1]?.id);
    expect(new Set(result.map((r) => r?.id))).toEqual(new Set(['a', 'b']));
  });

  it('returns one slot per request, padding unfillable slots with null', () => {
    const pool = [q('only', 43)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      [],
      [{ expectedLevel: 'EASY' }, { expectedLevel: 'EASY' }],
      false,
    );
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('only');
    expect(result[1]).toBeNull();
  });

  it('picks any unused question when no expected level is given', () => {
    const pool = [q('x', 45)];
    const result = QuestionSelectionStrategy.selectBestQuestions(
      pool,
      [],
      [{}],
      false,
    );
    expect(result[0]?.id).toBe('x');
  });

  it('returns an empty array for no requests', () => {
    const result = QuestionSelectionStrategy.selectBestQuestions(
      [q('x', 43)],
      [],
      [],
      true,
    );
    expect(result).toEqual([]);
  });
});
