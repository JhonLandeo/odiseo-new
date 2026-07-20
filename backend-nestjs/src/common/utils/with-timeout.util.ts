/**
 * Races `operation` against a timer so a client with no command timeout of
 * its own (e.g. a Keyv/Redis cache client) can never hang the caller.
 *
 * Extracted from what used to be near-identical private
 * `withCacheTimeout`/`withTimeout` methods on `AuthService` and
 * `TenantsService` — same `Promise.race` + `clearTimeout`-in-`finally` shape,
 * differing only in which timeout value they read. Callers are expected to
 * catch a rejection (timeout or any other operation failure) and degrade to
 * a non-cached path, exactly as those two services already do; this helper
 * only bounds the wait, it does not decide the fallback.
 */
export async function withTimeout<T>(
  operation: () => Promise<T>,
  label: string,
  timeoutMs: number,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([operation(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
