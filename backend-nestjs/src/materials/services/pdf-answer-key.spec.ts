import {
  resolveAnswerKeyLetter,
  NO_ANSWER_KEY_MARK,
} from './pdf-generator.service';

describe('resolveAnswerKeyLetter (answer-key correctness detection)', () => {
  const makeLogger = () => ({ warn: jest.fn() });

  it('returns the correct letter for a well-formed question and stays silent', () => {
    const logger = makeLogger();

    const letter = resolveAnswerKeyLetter(
      [
        { label: 'A', isCorrect: false },
        { label: 'B', isCorrect: true },
        { label: 'C', isCorrect: false },
      ],
      'Q-123',
      logger,
    );

    expect(letter).toBe('B');
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('flags and logs when NO alternative is correct (missing key)', () => {
    const logger = makeLogger();

    const letter = resolveAnswerKeyLetter(
      [
        { label: 'A', isCorrect: false },
        { label: 'B', isCorrect: false },
      ],
      'Q-777',
      logger,
    );

    expect(letter).toBe(NO_ANSWER_KEY_MARK);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Q-777'),
    );
    expect(logger.warn.mock.calls[0][0]).toContain('no correct alternative');
  });

  it('flags and logs when MORE than one alternative is correct (ambiguous key)', () => {
    const logger = makeLogger();

    const letter = resolveAnswerKeyLetter(
      [
        { label: 'A', isCorrect: true },
        { label: 'B', isCorrect: true },
        { label: 'C', isCorrect: false },
      ],
      'Q-999',
      logger,
    );

    // Never emit a confidently-wrong single letter for ambiguous data.
    expect(letter).toBe(NO_ANSWER_KEY_MARK);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain('Q-999');
    expect(logger.warn.mock.calls[0][0]).toContain('2 alternatives flagged');
  });

  it('flags empty / null option lists as a missing key', () => {
    const logger = makeLogger();

    expect(resolveAnswerKeyLetter([], 'Q-empty', logger)).toBe(
      NO_ANSWER_KEY_MARK,
    );
    expect(resolveAnswerKeyLetter(null, 'Q-null', logger)).toBe(
      NO_ANSWER_KEY_MARK,
    );
    expect(resolveAnswerKeyLetter(undefined, 'Q-undef', logger)).toBe(
      NO_ANSWER_KEY_MARK,
    );
    expect(logger.warn).toHaveBeenCalledTimes(3);
  });
});
