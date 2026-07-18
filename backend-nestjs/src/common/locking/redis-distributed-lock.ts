import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  DistributedLock,
  DISTRIBUTED_LOCK,
} from './distributed-lock.interface';

/**
 * The single Redis operation this lock needs. Narrowed to one method so the
 * implementation is unit-testable against a fake instead of a live Redis, and
 * so nothing here depends on which Redis client the app happens to ship.
 */
export interface LockRedisClient {
  set(
    key: string,
    value: string,
    options: { NX: true; PX: number },
  ): Promise<string | null>;
}

/** Injection token for the lazily-resolved Redis client. */
export const LOCK_REDIS_CLIENT = Symbol('LOCK_REDIS_CLIENT');

export type LockRedisClientProvider = () => Promise<LockRedisClient>;

/** Namespaced so cron locks cannot collide with the auth or catalog caches. */
const KEY_PREFIX = 'lock:';

@Injectable()
export class RedisDistributedLock implements DistributedLock {
  private readonly logger = new Logger(RedisDistributedLock.name);

  constructor(
    @Inject(LOCK_REDIS_CLIENT)
    private readonly getClient: LockRedisClientProvider,
  ) {}

  async tryAcquire(key: string, ttlMs: number): Promise<boolean> {
    try {
      const client = await this.getClient();
      // SET NX PX is a single atomic round-trip: exactly one concurrent caller
      // gets "OK", every other one gets null.
      const result = await client.set(`${KEY_PREFIX}${key}`, '1', {
        NX: true,
        PX: ttlMs,
      });
      return result !== null;
    } catch (error: any) {
      // Fail CLOSED. If Redis is unreachable we cannot tell whether another
      // replica is already running, and the whole point of this lock is that N
      // concurrent runs are worse than zero runs. Redis is also a hard
      // dependency of the queue these jobs feed, so a Redis outage means the
      // work could not complete anyway.
      this.logger.error(
        `Could not acquire distributed lock "${key}", skipping this run: ${error.message}`,
      );
      return false;
    }
  }

  async runExclusively<T>(
    key: string,
    ttlMs: number,
    work: () => Promise<T>,
  ): Promise<T | undefined> {
    const acquired = await this.tryAcquire(key, ttlMs);
    if (!acquired) {
      this.logger.log(
        `Another replica holds "${key}"; skipping this scheduled run.`,
      );
      return undefined;
    }
    return work();
  }
}

export { DISTRIBUTED_LOCK };
