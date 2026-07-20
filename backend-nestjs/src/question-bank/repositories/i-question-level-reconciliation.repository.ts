import type { QuestionLevelReconciliationOutcome } from '../entities/question-level-reconciliation-state.entity';

export const IQuestionLevelReconciliationRepository = Symbol(
  'IQuestionLevelReconciliationRepository',
);

/** Result of a single question-level id reconciliation run, to be persisted. */
export interface QuestionLevelReconciliationRecord {
  outcome: QuestionLevelReconciliationOutcome;
  expectedCount: number;
  foundCount: number;
  missingIds: number[];
}

export interface IQuestionLevelReconciliationRepository {
  /**
   * Persists the outcome of a question-level id reconciliation run. Upserts
   * the single singleton row — see `QuestionLevelReconciliationState`.
   */
  recordQuestionLevelReconciliation(
    record: QuestionLevelReconciliationRecord,
  ): Promise<void>;
}
