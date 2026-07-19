/**
 * Cross-replica mutual exclusion for scheduled work.
 *
 * `@Cron` fires in EVERY replica, so any job with side effects runs N times per
 * schedule. The jobs this guards (catalogue sync, topic-ID-space allocation,
 * automatic material generation, consumption-metrics roll-ups — each living in
 * its own feature module, not centralized here) are idempotent enough that a
 * skipped run is strictly cheaper than N concurrent runs — so this is a "first
 * one wins, the rest step aside" lock, not a queue. Callers never wait for the
 * lock.
 */
export const DISTRIBUTED_LOCK = Symbol('DISTRIBUTED_LOCK');

export interface DistributedLock {
  /**
   * Attempts to claim `key` for `ttlMs`. Returns true only for the caller that
   * won the claim. The lock is NOT released when the work finishes: it expires
   * on its TTL. Releasing early would let a replica whose clock fires a moment
   * later start a second run of the same tick, which is the exact duplication
   * this exists to prevent. Pick a TTL longer than the job but shorter than the
   * schedule interval.
   */
  tryAcquire(key: string, ttlMs: number): Promise<boolean>;

  /**
   * Runs `work` only if this caller wins `key`. Returns the work's result, or
   * undefined when another replica already holds the lock.
   */
  runExclusively<T>(
    key: string,
    ttlMs: number,
    work: () => Promise<T>,
  ): Promise<T | undefined>;
}
