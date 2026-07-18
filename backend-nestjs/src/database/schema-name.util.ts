/**
 * Valid PostgreSQL schema identifiers used by the platform.
 * Accepts `public`, the reserved system schema, and per-tenant schemas
 * (`tenant_<uuid>`). This is a hard allowlist: schema names are interpolated
 * into `SET search_path` / DDL, which cannot be parameterized, so anything
 * that does not match is rejected before it reaches the database.
 *
 * The hyphen is REQUIRED: tenant schemas are built as `tenant_${company.id}`
 * where the id is a canonical UUID (`tenant_550e8400-e29b-...`). Omitting `-`
 * from the charset rejected every real tenant schema and made `runInSchema`
 * throw on every request. Hyphens are safe here because callers always wrap
 * the identifier in double quotes; the allowlist is what keeps quotes,
 * semicolons and whitespace out.
 */
export const SCHEMA_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

export function assertValidSchema(schema: string): void {
  if (!schema || !SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error(`Invalid tenant schema identifier: "${schema}"`);
  }
}
