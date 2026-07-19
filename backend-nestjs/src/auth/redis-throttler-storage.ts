import { Logger } from '@nestjs/common';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import type Redis from 'ioredis';

// Mirror the base service's increment() return type without a deep subpath
// import into @nestjs/throttler internals.
type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorageRedisService['increment']>
>;

/**
 * Redis-backed throttler storage that fails OPEN on a Redis outage.
 *
 * The base service runs an EVAL against Redis on every guarded request. If
 * Redis is unreachable that call rejects, and ThrottlerGuard would surface the
 * rejection as a 500 — locking every legitimate user out of /auth/login while
 * Redis is down. Because the rate limit already depends entirely on Redis, we
 * would rather lose the global limit for the duration of the blip than deny
 * authentication outright, so on error we return a non-blocking record.
 *
 * Normal operation is unchanged: while Redis is up the limit is enforced
 * globally across every replica (the whole reason for moving off in-memory
 * storage).
 */
export class RedisThrottlerStorage extends ThrottlerStorageRedisService {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(redis: Redis) {
    super(redis);
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    try {
      return await super.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    } catch (err) {
      this.logger.warn(
        `Throttler Redis unavailable — allowing request (failing open): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
