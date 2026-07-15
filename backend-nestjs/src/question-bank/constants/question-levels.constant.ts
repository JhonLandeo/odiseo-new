export const QUESTION_DIFFICULTY_MAPPING: Record<string, number[]> = {
  EASY: [43, 44],
  MEDIUM: [45],
  HARD: [46, 47, 48, 49, 50, 51, 52],
};

/**
 * Returns the mapped level IDs for a given string difficulty (EASY, MEDIUM, HARD).
 * Includes legacy fallbacks for Spanish terminology.
 */
export function getLevelIdsForDifficulty(difficulty: string): number[] {
  const upperDiff = String(difficulty).toUpperCase();
  if (upperDiff === 'EASY' || upperDiff === 'FACIL') {
    return QUESTION_DIFFICULTY_MAPPING.EASY;
  }
  if (upperDiff === 'MEDIUM' || upperDiff === 'INTERMEDIO' || upperDiff === 'MEDIA') {
    return QUESTION_DIFFICULTY_MAPPING.MEDIUM;
  }
  if (upperDiff === 'HARD' || upperDiff === 'DIFICIL') {
    return QUESTION_DIFFICULTY_MAPPING.HARD;
  }
  return [];
}
