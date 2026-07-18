import { Logger } from '@nestjs/common';
import {
  LockRedisClient,
  RedisDistributedLock,
} from './redis-distributed-lock';

/**
 * Stands in for Redis with the one guarantee the lock depends on: SET NX is
 * atomic, so of any number of callers racing on a key exactly one gets "OK".
 * Modelled as a plain Map because a single-threaded JS fake cannot interleave —
 * which is precisely the property real Redis provides.
 */
function createFakeRedis(): LockRedisClient & { keys: Map<string, string> } {
  const keys = new Map<string, string>();
  return {
    keys,
    set(key: string, value: string, options: { NX: true; PX: number }) {
      if (options.NX && keys.has(key)) return Promise.resolve(null);
      keys.set(key, value);
      return Promise.resolve('OK');
    },
  };
}

describe('RedisDistributedLock', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  function createLock(client: LockRedisClient) {
    return new RedisDistributedLock(() => Promise.resolve(client));
  }

  describe('tryAcquire', () => {
    it('grants the lock to exactly one of several simultaneous callers', async () => {
      const lock = createLock(createFakeRedis());

      const results = await Promise.all(
        Array.from({ length: 5 }, () => lock.tryAcquire('job', 1000)),
      );

      expect(results.filter(Boolean)).toHaveLength(1);
    });

    it('keeps distinct keys independent', async () => {
      const lock = createLock(createFakeRedis());

      expect(await lock.tryAcquire('job-a', 1000)).toBe(true);
      expect(await lock.tryAcquire('job-b', 1000)).toBe(true);
      expect(await lock.tryAcquire('job-a', 1000)).toBe(false);
    });

    it('sets the requested TTL with NX so the lock self-expires', async () => {
      const client = createFakeRedis();
      const spy = jest.spyOn(client, 'set');
      const lock = createLock(client);

      await lock.tryAcquire('job', 45_000);

      expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String), {
        NX: true,
        PX: 45_000,
      });
    });

    it('namespaces keys so cron locks cannot collide with other Redis users', async () => {
      const client = createFakeRedis();
      const lock = createLock(client);

      await lock.tryAcquire('cron:catalogs:sync', 1000);

      expect([...client.keys.keys()]).toEqual(['lock:cron:catalogs:sync']);
    });

    it('fails closed when Redis is unreachable', async () => {
      const lock = new RedisDistributedLock(() =>
        Promise.reject(new Error('ECONNREFUSED')),
      );

      // Better to skip a run than to let every replica run unguarded.
      expect(await lock.tryAcquire('job', 1000)).toBe(false);
    });
  });

  describe('runExclusively', () => {
    it('runs the work exactly once across simultaneous callers', async () => {
      const lock = createLock(createFakeRedis());
      const work = jest.fn().mockResolvedValue('done');

      const results = await Promise.all(
        Array.from({ length: 4 }, () => lock.runExclusively('job', 1000, work)),
      );

      expect(work).toHaveBeenCalledTimes(1);
      expect(results.filter((r) => r === 'done')).toHaveLength(1);
      expect(results.filter((r) => r === undefined)).toHaveLength(3);
    });

    it('does not release the lock when the work finishes', async () => {
      const lock = createLock(createFakeRedis());

      await lock.runExclusively('job', 1000, async () => 'first');
      // A replica whose clock fires a moment later must still be turned away;
      // only the TTL may free the lock.
      const second = await lock.runExclusively(
        'job',
        1000,
        async () => 'second',
      );

      expect(second).toBeUndefined();
    });

    it('does not swallow a failure from the work itself', async () => {
      const lock = createLock(createFakeRedis());

      await expect(
        lock.runExclusively('job', 1000, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
    });

    it('skips the work entirely when the lock cannot be taken', async () => {
      const lock = new RedisDistributedLock(() =>
        Promise.reject(new Error('ECONNREFUSED')),
      );
      const work = jest.fn();

      expect(await lock.runExclusively('job', 1000, work)).toBeUndefined();
      expect(work).not.toHaveBeenCalled();
    });
  });
});
