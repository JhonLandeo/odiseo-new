import { scrubSecrets } from './scrub-secrets.util';

describe('scrubSecrets', () => {
  it('redacts credentials embedded in a connection URL', () => {
    const result = scrubSecrets(
      'connect ECONNREFUSED postgres://dbuser:sup3rSecret@db.internal:5432/odiseo',
    );

    expect(result).not.toContain('dbuser');
    expect(result).not.toContain('sup3rSecret');
    expect(result).toBe(
      'connect ECONNREFUSED postgres://[REDACTED]:[REDACTED]@db.internal:5432/odiseo',
    );
  });

  // redis://:password@host is the standard AUTH-only connection-string form
  // (no username) — a `+` quantifier on the username segment would silently
  // let this exact, common shape pass through unredacted.
  it('redacts a password-only connection URL with no username', () => {
    const result = scrubSecrets(
      'ECONNREFUSED connecting to redis://:mypassword@127.0.0.1:6379',
    );

    expect(result).not.toContain('mypassword');
    expect(result).toBe(
      'ECONNREFUSED connecting to redis://[REDACTED]:[REDACTED]@127.0.0.1:6379',
    );
  });

  it('redacts a Bearer token', () => {
    const result = scrubSecrets('upstream sent Bearer abc123.def456-ghi_JKL');

    expect(result).not.toContain('abc123.def456-ghi_JKL');
    expect(result).toBe('upstream sent Bearer [REDACTED]');
  });

  it('redacts password/token/apikey key=value pairs, case-insensitively', () => {
    expect(scrubSecrets('password=hunter2')).toBe('password=[REDACTED]');
    expect(scrubSecrets('TOKEN=abcdef123456')).toBe('TOKEN=[REDACTED]');
    expect(scrubSecrets('apikey=xyz&other=1')).toBe(
      'apikey=[REDACTED]&other=1',
    );
  });

  it('leaves ordinary error text untouched', () => {
    const text = 'MaterialRequest req-1 not found for tenant tenant-1';
    expect(scrubSecrets(text)).toBe(text);
  });

  // Near-miss inputs that share partial structure with each pattern, to
  // prove the patterns are bounded and don't over-match structurally
  // similar-but-non-secret text.
  describe('does not mangle non-secret text that is merely structurally similar', () => {
    it('a URL with a bare username and no password (no colon before @)', () => {
      const text = 'fetch failed for https://user@github.com/org/repo.git';
      expect(scrubSecrets(text)).toBe(text);
    });

    it('an ordinary email address in prose', () => {
      const text = 'contact admin@example.com if this keeps happening';
      expect(scrubSecrets(text)).toBe(text);
    });

    it('a non-secret key=value pair (not password/token/apikey/secret)', () => {
      const text = 'query failed: limit=50&offset=0&id=42';
      expect(scrubSecrets(text)).toBe(text);
    });

    it('a camelCase field name that merely contains "secret"/"token" as a substring, not the exact redacted keys', () => {
      // Only bare password/passwd/token/apikey/api_key/secret (as the FULL
      // key before "=") are redacted -- this proves the pattern doesn't
      // partial-match into an unrelated key like "clientSecretId".
      const text = 'clientSecretId=not-actually-a-secret-value';
      expect(scrubSecrets(text)).toBe(text);
    });
  });

  it('handles multiple distinct secrets in the same string', () => {
    const result = scrubSecrets(
      'retry postgres://u:p@host/db failed; Bearer tok123 also rejected; password=xyz',
    );

    expect(result).not.toContain('u:p@');
    expect(result).not.toContain('tok123');
    expect(result).not.toContain('=xyz');
    expect(result).toContain('[REDACTED]');
  });
});
