import Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { RedisThrottlerStorage } from './redis-throttler-storage';

describe('RedisThrottlerStorage', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;

  beforeEach(() => {
    // lazyConnect so the client never actually dials Redis during the test.
    redis = new Redis({ lazyConnect: true });
    redis.on('error', () => undefined);
    storage = new RedisThrottlerStorage(redis);
  });

  afterEach(() => {
    redis.disconnect();
    jest.restoreAllMocks();
  });

  it('delegates to the Redis-backed storage when Redis is reachable', async () => {
    const record = {
      totalHits: 3,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
    const spy = jest
      .spyOn(ThrottlerStorageRedisService.prototype, 'increment')
      .mockResolvedValue(record);

    await expect(
      storage.increment('key', 60_000, 5, 0, 'default'),
    ).resolves.toEqual(record);
    expect(spy).toHaveBeenCalledWith('key', 60_000, 5, 0, 'default');
  });

  it('fails open (allows the request) when the Redis command rejects', async () => {
    jest
      .spyOn(ThrottlerStorageRedisService.prototype, 'increment')
      .mockRejectedValue(new Error('connect ECONNREFUSED'));
    // Silence the expected warning so the outage does not pollute test output.
    jest
      .spyOn((storage as unknown as { logger: { warn: () => void } }).logger, 'warn')
      .mockImplementation(() => undefined);

    const record = await storage.increment('key', 60_000, 5, 0, 'default');

    // A non-blocking record: the login is permitted rather than 500'd.
    expect(record.isBlocked).toBe(false);
    expect(record.totalHits).toBe(0);
    // ttl (ms) converted to the seconds the base storage reports.
    expect(record.timeToExpire).toBe(60);
  });
});
