/**
 * Best-effort scrub of common secret-shaped substrings from free-text error
 * messages/stacks before they reach a log line.
 *
 * pino's `redact` option (see `pino-logger.options.ts`) only strips specific
 * OBJECT KEY PATHS out of structured log fields (`req.headers.cookie`,
 * `req.body.password`, …) — it has no visibility into a plain string, which
 * is exactly what `AllExceptionsFilter` hands the logger for `error.message`
 * and `error.stack`. A driver/client error (a Postgres connection failure, a
 * third-party API error) can legitimately embed a credential INSIDE that
 * string (a connection URL's `user:pass@host`, a `Bearer <token>` echoed back
 * by a misbehaving upstream), and none of the structured redaction would ever
 * see it.
 *
 * This is deliberately narrow: a handful of high-confidence patterns, not a
 * general secret scanner (which would have unacceptable false-negative rates
 * either way, and a general one risks false positives that mangle genuinely
 * useful error text). It closes the specific, concrete gap this filter has —
 * it does not claim to make arbitrary error text safe to log.
 */
const SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  // scheme://user:pass@host (connection strings, presigned-style URLs).
  // Username is OPTIONAL (`*`, not `+`) — `scheme://:pass@host` is the
  // standard AUTH-only form (e.g. a Redis/Valkey password URL with no
  // username), not a rare edge case, and a `+` here would silently let that
  // exact shape through unredacted.
  {
    pattern: /(\w+:\/\/)[^\s/:@]*:[^\s/@]+@/g,
    replacement: '$1[REDACTED]:[REDACTED]@',
  },
  // Authorization: Bearer <token> / Bearer <token> standalone
  {
    pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replacement: 'Bearer [REDACTED]',
  },
  // password=xxx / token=xxx / apikey=xxx style query-string or key=value pairs
  {
    pattern: /\b(password|passwd|token|apikey|api_key|secret)=([^\s&]+)/gi,
    replacement: '$1=[REDACTED]',
  },
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (scrubbed, { pattern, replacement }) =>
      scrubbed.replace(pattern, replacement),
    text,
  );
}
