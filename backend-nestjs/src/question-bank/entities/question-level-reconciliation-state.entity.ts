import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type QuestionLevelReconciliationOutcome = 'PASS' | 'FAIL';

/**
 * Durable record of the last question-level id reconciliation run. See
 * `QuestionLevelIdReconciliationService` for what this checks and why it
 * exists — it is the question-bank equivalent of
 * `TopicIdSpaceReconciliationState`, mirroring its shape and rationale: a
 * failing check previously only reached `Logger.error`, unanswerable outside
 * log retention. Lives in the same `public` schema for the same reason: this
 * is platform-wide state, not per-tenant.
 *
 * Single-row by design: there is exactly one reconciliation check (the whole
 * of `QUESTION_DIFFICULTY_MAPPING`), so no natural key is needed. `id` is a
 * fixed singleton value the repository always upserts against.
 */
@Entity({ schema: 'public', name: 'question_level_reconciliation_state' })
export class QuestionLevelReconciliationState {
  /** Fixed singleton row id — always 1. */
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  /** When the check last ran, pass or fail. */
  @Column({ type: 'timestamptz', name: 'last_checked_at', nullable: true })
  lastCheckedAt: Date | null;

  /** Outcome of the last run: PASS when every mapped id was found. */
  @Column({ type: 'varchar', length: 20, name: 'last_outcome', nullable: true })
  lastOutcome: QuestionLevelReconciliationOutcome | null;

  /** How many distinct level ids `QUESTION_DIFFICULTY_MAPPING` referenced. */
  @Column({ type: 'integer', name: 'last_expected_count', nullable: true })
  lastExpectedCount: number | null;

  /** How many of those ids were actually found in `odiseo.level`. */
  @Column({ type: 'integer', name: 'last_found_count', nullable: true })
  lastFoundCount: number | null;

  /**
   * Comma-separated list of mapped ids that were NOT found in `odiseo.level`
   * on the last run (empty/null when the run passed). `simple-array` is
   * TypeORM's built-in column type for exactly this — a small list of
   * primitives in one text column, no separate table needed for ~10 ids.
   */
  @Column({
    type: 'simple-array',
    name: 'last_missing_ids',
    nullable: true,
  })
  lastMissingIds: number[] | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/** Fixed singleton row id this table is always upserted/read against. */
export const QUESTION_LEVEL_RECONCILIATION_STATE_ID = 1;
