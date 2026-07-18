import { assertValidSchema, SCHEMA_NAME_PATTERN } from './schema-name.util';

describe('assertValidSchema', () => {
  describe('accepts the identifiers the platform actually builds', () => {
    // Regression: the pattern originally omitted `-`, which rejected every
    // real tenant schema (built as `tenant_${uuid}`) and made runInSchema
    // throw on every request — login included.
    it('accepts a tenant schema built from a canonical UUID', () => {
      const companyId = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => assertValidSchema(`tenant_${companyId}`)).not.toThrow();
    });

    it('accepts the public schema', () => {
      expect(() => assertValidSchema('public')).not.toThrow();
    });

    it('accepts a plain underscore identifier', () => {
      expect(() => assertValidSchema('tenant_abc')).not.toThrow();
    });
  });

  describe('rejects anything that could escape the quoted identifier', () => {
    it.each([
      ['statement terminator', 'tenant_x"; DROP SCHEMA public; --'],
      ['search_path escape', 'tenant_x", public; --'],
      ['single quote', "tenant_x' OR 1=1"],
      ['whitespace', 'tenant x'],
      ['semicolon', 'pg_catalog;'],
      ['leading digit', '1tenant'],
      ['empty string', ''],
    ])('rejects %s', (_label, schema) => {
      expect(() => assertValidSchema(schema)).toThrow(
        /Invalid tenant schema identifier/,
      );
    });
  });

  it('exposes the pattern used for validation', () => {
    expect(SCHEMA_NAME_PATTERN.test('tenant_abc-123')).toBe(true);
    expect(SCHEMA_NAME_PATTERN.test('tenant abc')).toBe(false);
  });
});
