import { randomBytes } from 'crypto';

/**
 * Resolves the seed super-admin password.
 *
 * In production the value is mandatory: a generated password would be printed
 * to deploy logs and then lost, and a default would be a known credential on an
 * account holding every platform permission. Refusing to migrate is the safe
 * failure.
 *
 * Elsewhere a missing value yields a strong random password, printed once so
 * the developer can use it. It is never persisted in plaintext.
 *
 * Lives outside `migrations/` on purpose: the datasource globs that directory,
 * so anything sitting next to a migration — including a spec file — is loaded
 * and executed as one.
 */
export function resolveSeedPassword(): string {
  const configured = process.env.SEED_SUPERADMIN_PASSWORD;
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SEED_SUPERADMIN_PASSWORD is not set. Refusing to seed a production ' +
        'super admin: a default or generated password on an account holding ' +
        'every platform permission is not recoverable once it leaks.',
    );
  }

  const generated = randomBytes(12).toString('base64url');
  // Intentional: this is the only moment the value exists in plaintext.
  console.warn(
    `\n[SeedSuperAdmin] SEED_SUPERADMIN_PASSWORD was not set. Generated one for this environment:\n` +
      `                 ${generated}\n` +
      `                 Store it now — it is not recoverable from the database.\n`,
  );
  return generated;
}
