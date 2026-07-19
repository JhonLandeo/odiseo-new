import {
  DEFAULT_JWT_EXPIRATION_MS,
  jwtExpirationToMs,
} from './jwt-expiration.util';

// The session cookie's maxAge must track JWT_EXPIRATION with the same
// semantics jsonwebtoken applies to the signing lifetime (the `ms` package):
// otherwise cookie and token expire at different moments.
describe('jwtExpirationToMs', () => {
  it('parses unit-suffixed lifetimes', () => {
    expect(jwtExpirationToMs('15m')).toBe(15 * 60 * 1000);
    expect(jwtExpirationToMs('24h')).toBe(24 * 60 * 60 * 1000);
    expect(jwtExpirationToMs('7d')).toBe(7 * 24 * 60 * 60 * 1000);
    expect(jwtExpirationToMs('30s')).toBe(30 * 1000);
    expect(jwtExpirationToMs('2w')).toBe(2 * 7 * 24 * 60 * 60 * 1000);
  });

  it('parses long-form units and surrounding whitespace', () => {
    expect(jwtExpirationToMs('2 hours')).toBe(2 * 60 * 60 * 1000);
    expect(jwtExpirationToMs('1 day')).toBe(24 * 60 * 60 * 1000);
    expect(jwtExpirationToMs('500 ms')).toBe(500);
    expect(jwtExpirationToMs(' 45 mins ')).toBe(45 * 60 * 1000);
  });

  it('treats a bare number as milliseconds, matching ms-package semantics for strings', () => {
    expect(jwtExpirationToMs('60000')).toBe(60_000);
  });

  it('supports fractional values', () => {
    expect(jwtExpirationToMs('1.5h')).toBe(90 * 60 * 1000);
  });

  it('defaults to 24h when unset', () => {
    expect(jwtExpirationToMs(undefined)).toBe(DEFAULT_JWT_EXPIRATION_MS);
    expect(jwtExpirationToMs('')).toBe(DEFAULT_JWT_EXPIRATION_MS);
  });

  it('defaults to 24h on unparseable or non-positive input instead of emitting a broken cookie', () => {
    expect(jwtExpirationToMs('soon')).toBe(DEFAULT_JWT_EXPIRATION_MS);
    expect(jwtExpirationToMs('10 fortnights')).toBe(DEFAULT_JWT_EXPIRATION_MS);
    expect(jwtExpirationToMs('-15m')).toBe(DEFAULT_JWT_EXPIRATION_MS);
    expect(jwtExpirationToMs('0')).toBe(DEFAULT_JWT_EXPIRATION_MS);
  });
});
