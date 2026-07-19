/**
 * Maps `items` through an async `task` with at most `concurrency` tasks in
 * flight at once, preserving input order in the result.
 *
 * Exists to bound cross-schema fan-out: platform-level endpoints iterate every
 * tenant schema, and an unbounded Promise.all would race one connection per
 * tenant against a pool of 20, exhausting it for the rest of the process. A
 * small worker pool keeps the fan-out a bounded fraction of the pool. Local by
 * design — the shape is p-limit's, but a dependency is not warranted for a
 * dozen lines.
 *
 * A task rejection propagates and rejects the whole map; callers that want
 * per-item tolerance catch inside the task.
 */
/**
 * Upper bound on simultaneous per-tenant-schema queries for platform-level
 * fan-outs (admin listings, aggregate dashboards). The pool holds 20
 * connections shared with request traffic; fanning out one transaction per
 * tenant with Promise.all would let a single platform read starve everything
 * else. Lives next to `mapWithConcurrency` because every schema fan-out pairs
 * the two.
 */
export const SCHEMA_FANOUT_CONCURRENCY = 4;

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new Error(
      `mapWithConcurrency requires a positive integer concurrency, got: ${concurrency}`,
    );
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await task(items[index], index);
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);

  return results;
}
