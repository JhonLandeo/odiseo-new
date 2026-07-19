/**
 * Milliseconds in the default '24h' token lifetime, mirroring the fallback in
 * jwtModuleOptionsFactory so cookie and token expire together when
 * JWT_EXPIRATION is unset.
 */
export const DEFAULT_JWT_EXPIRATION_MS = 24 * 60 * 60 * 1000;

// Exported so env.validation.ts can reject a malformed JWT_EXPIRATION at boot
// time using the exact same grammar this file parses with — jsonwebtoken (via
// the `ms` package) only rejects a bad string at SIGN time, so without this
// shared pattern a typo boots cleanly and then 500s on every login.
export const EXPIRATION_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?$/i;

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  // The `ms` package (which jsonwebtoken uses for string lifetimes) counts a
  // year as 365.25 days.
  y: 365.25 * 24 * 60 * 60 * 1000,
};

function canonicalUnit(unit: string): string {
  const lower = unit.toLowerCase();
  if (lower.startsWith('ms') || lower.startsWith('millisecond')) return 'ms';
  return lower[0];
}

/**
 * Converts a JWT_EXPIRATION value to milliseconds for the session cookie's
 * maxAge, so the cookie dies with the token instead of outliving it (or
 * expiring while the token is still valid).
 *
 * JWT_EXPIRATION is a string from the environment and jsonwebtoken parses
 * string lifetimes with the `ms` package; this mirrors those semantics for the
 * formats we accept — a bare number is MILLISECONDS, `15m`/`24h`/`7d` style
 * carries its unit — without taking `ms` on as a direct dependency for one
 * call site. Anything unparseable (or non-positive) falls back to the same
 * 24h default jwtModuleOptionsFactory signs with.
 */
export function jwtExpirationToMs(expiration: string | undefined): number {
  if (!expiration) return DEFAULT_JWT_EXPIRATION_MS;

  const match = EXPIRATION_PATTERN.exec(expiration.trim());
  if (!match) return DEFAULT_JWT_EXPIRATION_MS;

  const value = parseFloat(match[1]);
  const unit = match[2] ? canonicalUnit(match[2]) : 'ms';
  const milliseconds = Math.round(value * UNIT_MS[unit]);

  return milliseconds > 0 ? milliseconds : DEFAULT_JWT_EXPIRATION_MS;
}
