import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type TopicIdSpaceReconciliationOutcome = 'PASS' | 'FAIL';

/**
 * Durable record of the last topic id-space reconciliation run. See
 * `TopicIdSpaceReconciliationService.checkOverlap` for what this checks and
 * why it exists.
 *
 * Before this, a failing ratio only reached `Logger.error` — visible in log
 * retention alone, with no way for an operator or a future audit to ask "when
 * did this last run, and did it pass?" without grepping logs. Mirrors
 * `CatalogSyncState`'s shape and lives in the same `public` schema for the
 * same reason: this is platform-wide state, not per-tenant.
 *
 * Single-row by design: unlike `CatalogSyncState` (keyed by `source` because
 * more than one upstream catalog could exist), there is exactly one
 * reconciliation check, so no natural key is needed. `id` is a fixed
 * singleton value the repository always upserts against.
 */
@Entity({ schema: 'public', name: 'topic_id_space_reconciliation_state' })
export class TopicIdSpaceReconciliationState {
  /** Fixed singleton row id — always 1. */
  @PrimaryColumn({ type: 'smallint', default: 1 })
  id: number;

  /** When the check last ran, pass or fail. */
  @Column({ type: 'timestamptz', name: 'last_checked_at', nullable: true })
  lastCheckedAt: Date | null;

  /** Overlap ratio computed on the last run (0..1). */
  @Column({
    type: 'double precision',
    name: 'last_overlap_ratio',
    nullable: true,
  })
  lastOverlapRatio: number | null;

  /** Outcome of the last run relative to the minimum overlap threshold. */
  @Column({ type: 'varchar', length: 20, name: 'last_outcome', nullable: true })
  lastOutcome: TopicIdSpaceReconciliationOutcome | null;

  /** `totalCoreTopics` from the last run. */
  @Column({ type: 'integer', name: 'last_core_topics_count', nullable: true })
  lastCoreTopicsCount: number | null;

  /** `overlappingTopics` from the last run. */
  @Column({
    type: 'integer',
    name: 'last_overlapping_topics_count',
    nullable: true,
  })
  lastOverlappingTopicsCount: number | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/** Fixed singleton row id this table is always upserted/read against. */
export const TOPIC_ID_SPACE_RECONCILIATION_STATE_ID = 1;
