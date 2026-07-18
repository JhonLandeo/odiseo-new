import { MaterialsCron } from './materials.cron';

/**
 * Scope: the cross-replica exclusion added around this @Cron. The generation
 * walk itself is covered by generate-material.use-case.spec.ts.
 */
function createCron(lockGrants: boolean) {
  const entityManager = { find: jest.fn().mockResolvedValue([]) };
  const lock = {
    tryAcquire: jest.fn().mockResolvedValue(lockGrants),
    runExclusively: jest.fn((_key, _ttl, work: () => Promise<any>) =>
      lockGrants ? work() : Promise.resolve(undefined),
    ),
  };

  const cron = new MaterialsCron(
    {} as any,
    {} as any,
    {} as any,
    entityManager as any,
    lock as any,
  );

  return { cron, entityManager, lock };
}

describe('MaterialsCron', () => {
  it('guards the run behind a job-specific lock', async () => {
    const { cron, lock } = createCron(true);

    await cron.handleCron();

    expect(lock.runExclusively).toHaveBeenCalledWith(
      'cron:materials:auto-generate',
      expect.any(Number),
      expect.any(Function),
    );
  });

  it('uses a TTL that expires well within the daily interval', async () => {
    const { cron, lock } = createCron(true);

    await cron.handleCron();

    const ttl = lock.runExclusively.mock.calls[0][1];
    expect(ttl).toBeGreaterThan(0);
    // A replica that dies mid-run must not block tomorrow's tick.
    expect(ttl).toBeLessThan(24 * 60 * 60 * 1000);
  });

  it('proceeds to enumerate tenants when it wins the lock', async () => {
    const { cron, entityManager } = createCron(true);

    await cron.handleCron();

    expect(entityManager.find).toHaveBeenCalledTimes(1);
  });

  it('touches nothing when another replica already holds the lock', async () => {
    const { cron, entityManager } = createCron(false);

    // Without this, N replicas each read "no material yet" — the existence
    // check has no unique constraint behind it — and each enqueues a duplicate
    // generation job.
    await expect(cron.handleCron()).resolves.toBeUndefined();

    expect(entityManager.find).not.toHaveBeenCalled();
  });
});
