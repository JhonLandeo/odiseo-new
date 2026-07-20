/**
 * Canonical (already-normalized) difficulty labels. `getLevelIdsForDifficulty`
 * below still accepts raw `string` input (it normalizes case and Spanish
 * synonyms itself), but every application-layer signature that already only
 * ever carries one of these three normalized values should reference this
 * type instead of repeating the literal union inline.
 */
export type QuestionDifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD';

export const QUESTION_DIFFICULTY_MAPPING: Record<
  QuestionDifficultyLevel,
  number[]
> = {
  EASY: [43, 44],
  MEDIUM: [45],
  HARD: [46, 47, 48, 49, 50, 51, 52],
};

/**
 * Every level id referenced anywhere in `QUESTION_DIFFICULTY_MAPPING`,
 * flattened and de-duplicated. These are real foreign keys into the EXTERNAL
 * `odiseo.level` table (question-bank database) — this app has no
 * compile-time knowledge of that table's contents, so this list is what
 * `QuestionLevelIdReconciliationService` verifies still exists there.
 */
export const ALL_MAPPED_QUESTION_LEVEL_IDS: number[] = Array.from(
  new Set(Object.values(QUESTION_DIFFICULTY_MAPPING).flat()),
);

/**
 * Returns the mapped level IDs for a given string difficulty (EASY, MEDIUM, HARD).
 * Includes legacy fallbacks for Spanish terminology. Accepts raw `string`
 * input on purpose — callers pass through synonyms and mixed case that are
 * only normalized here, so this cannot be typed as `QuestionDifficultyLevel`.
 */
export function getLevelIdsForDifficulty(difficulty: string): number[] {
  const upperDiff = String(difficulty).toUpperCase();
  if (upperDiff === 'EASY' || upperDiff === 'FACIL') {
    return QUESTION_DIFFICULTY_MAPPING.EASY;
  }
  if (
    upperDiff === 'MEDIUM' ||
    upperDiff === 'INTERMEDIO' ||
    upperDiff === 'MEDIA'
  ) {
    return QUESTION_DIFFICULTY_MAPPING.MEDIUM;
  }
  if (upperDiff === 'HARD' || upperDiff === 'DIFICIL') {
    return QUESTION_DIFFICULTY_MAPPING.HARD;
  }
  return [];
}
