import { Question } from '../entities/question.entity';
import { getLevelIdsForDifficulty } from '../constants/question-levels.constant';

export interface SelectionRequest {
  expectedLevel?: string;
}

export class QuestionSelectionStrategy {
  /**
   * Centralized algorithm to select questions with fallbacks.
   * Priority 1: Unused questions matching the expected level.
   * Priority 2: Unused questions of any level.
   * Priority 3: Used questions (if allowRecycling is true).
   */
  public static selectBestQuestions(
    availablePool: Question[],
    usedIdsList: string[],
    requests: SelectionRequest[],
    allowRecycling: boolean = false,
  ): (Question | null)[] {
    const usedSet = new Set(usedIdsList);
    
    // Separate into unused and used pools
    const unusedPool = availablePool.filter((q) => !usedSet.has(q.id));
    const usedPool = availablePool.filter((q) => usedSet.has(q.id));

    // Fisher-Yates shuffle helper
    const shuffle = (array: any[]) => {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    };

    shuffle(unusedPool);
    shuffle(usedPool);

    const selectedQuestions: (Question | null)[] = [];

    for (const req of requests) {
      let selectedQ: Question | null = null;

      // Priority 1: Unused + Matching difficulty
      if (req.expectedLevel) {
        const levelIds = getLevelIdsForDifficulty(req.expectedLevel);
        const idx = unusedPool.findIndex((q) => levelIds.includes(q.levelId));
        if (idx !== -1) {
          selectedQ = unusedPool.splice(idx, 1)[0];
        }
      }

      // Priority 2: Unused + Any difficulty (Fallback 1)
      if (!selectedQ && unusedPool.length > 0) {
        selectedQ = unusedPool.splice(0, 1)[0];
      }

      // Priority 3: Used + Any difficulty (Fallback 2 - Agotamiento)
      if (!selectedQ && allowRecycling && usedPool.length > 0) {
        selectedQ = usedPool.splice(0, 1)[0];
      }

      selectedQuestions.push(selectedQ);
    }

    return selectedQuestions;
  }
}
