import { resolveSeedPassword } from './seed-superadmin-password';

/**
 * The seed credentials used to be literals in the migration file, committed to
 * the repository, for an account holding every platform permission — and the
 * migration runs in production exactly as it does locally.
 *
 * These tests pin the one property that matters: production cannot end up with
 * a password this repository knows.
 */
describe('resolveSeedPassword', () => {
  const originalEnv = process.env;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.SEED_SUPERADMIN_PASSWORD;
    delete process.env.NODE_ENV;
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    warn.mockRestore();
  });

  it('uses the configured password when one is supplied', () => {
    process.env.SEED_SUPERADMIN_PASSWORD = 'a-deliberate-choice';
    expect(resolveSeedPassword()).toBe('a-deliberate-choice');
  });

  it('honours the configured password in production too', () => {
    process.env.NODE_ENV = 'production';
    process.env.SEED_SUPERADMIN_PASSWORD = 'a-deliberate-choice';
    expect(resolveSeedPassword()).toBe('a-deliberate-choice');
  });

  it('refuses to seed a production super admin without an explicit password', () => {
    process.env.NODE_ENV = 'production';
    expect(() => resolveSeedPassword()).toThrow(/SEED_SUPERADMIN_PASSWORD/);
  });

  describe('outside production', () => {
    it('generates a password rather than falling back to a shared default', () => {
      const first = resolveSeedPassword();
      const second = resolveSeedPassword();

      expect(first).toEqual(expect.any(String));
      expect(first.length).toBeGreaterThanOrEqual(16);
      // A constant would be a known credential in every developer database.
      expect(second).not.toBe(first);
    });

    it('never returns the credential this repository used to ship', () => {
      expect(resolveSeedPassword()).not.toBe('superadmin123');
    });

    it('prints the generated password once, since it is not recoverable', () => {
      const generated = resolveSeedPassword();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain(generated);
    });
  });
});
