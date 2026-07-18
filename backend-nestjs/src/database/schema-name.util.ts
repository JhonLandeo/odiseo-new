/**
 * Valid PostgreSQL schema identifiers used by the platform.
 * Accepts `public`, the reserved system schema, and per-tenant schemas
 * (`tenant_<uuid>`). This is a hard allowlist: schema names are interpolated
 * into `SET search_path` / DDL, which cannot be parameterized, so anything
 * that does not match is rejected before it reaches the database.
 */
export const SCHEMA_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

export function assertValidSchema(schema: string): void {
  if (!schema || !SCHEMA_NAME_PATTERN.test(schema)) {
    throw new Error(`Invalid tenant schema identifier: "${schema}"`);
  }
}
