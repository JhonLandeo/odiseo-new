import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

export type CatalogSyncOutcome = 'SUCCESS' | 'FAILED';

/**
 * Durable record of the catalog synchronisation state.
 *
 * This used to be a cache entry, which made it useless as an operational
 * signal: the cache TTL (10 min) was far shorter than the sync interval (1 h),
 * so for ~50 minutes of every hour the UI reported "never synced", and any
 * restart erased the history entirely. The catalog is the source of every exam
 * question, so "is it fresh?" has to survive both the TTL and the process.
 *
 * Lives in `public` alongside courses/topics/subtopics: the catalog is a global
 * entity shared by every tenant, and so is its sync state.
 *
 * Single-row by design, keyed by source name so a second upstream catalog can
 * be added later without a schema change.
 */
@Entity({ schema: 'public', name: 'catalog_sync_state' })
export class CatalogSyncState {
  /** Logical name of the upstream source. */
  @PrimaryColumn({ type: 'varchar', length: 100 })
  source: string;

  /** When a sync was last attempted, successful or not. */
  @Column({ type: 'timestamptz', name: 'last_attempt_at', nullable: true })
  lastAttemptAt: Date | null;

  /** When catalogs were last written successfully. This is the freshness signal. */
  @Column({ type: 'timestamptz', name: 'last_success_at', nullable: true })
  lastSuccessAt: Date | null;

  /** Outcome of the most recent attempt. */
  @Column({ type: 'varchar', length: 20, name: 'last_outcome', nullable: true })
  lastOutcome: CatalogSyncOutcome | null;

  /**
   * Failure reason of the most recent attempt, cleared on success. Persisted
   * rather than only logged so a silent, weeks-long outage is visible in the
   * product instead of having to be inferred from log retention.
   */
  @Column({ type: 'text', name: 'last_error', nullable: true })
  lastError: string | null;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}

/** The only source in use today. */
export const CORE_API_SYNC_SOURCE = 'core-api';
