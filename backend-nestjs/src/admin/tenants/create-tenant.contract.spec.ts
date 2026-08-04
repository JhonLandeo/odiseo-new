/**
 * Cross-repository contract test: frontend createTenant payload vs backend
 * CreateTenantDto.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The admin UI's `createTenant` store action (frontend-vue) sends a payload —
 * `adminEmail`, `adminPassword`, `contactEmail`, ... — to POST
 * /v1/admin/tenants. The backend validates that body with `CreateTenantDto`
 * under a global `ValidationPipe({ whitelist: true, forbidNonWhitelisted:
 * true })`, which REJECTS (400) any property the DTO does not declare. When the
 * frontend added `adminEmail`/`adminPassword` but the DTO did not, every create
 * failed with "property adminEmail should not exist" — the drift this test
 * exists to catch.
 *
 * It reads BOTH files straight off disk (modelled on
 * frontend-vue/src/core/auth/permissions.contract.spec.ts) and asserts every
 * field the frontend payload sends is an accepted property of the DTO. Its
 * entire purpose is to FAIL loudly the next time the frontend sends a field the
 * DTO would reject.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolved from this file's own directory so the test is independent of the
// working directory jest happens to be launched from.
const DTO_FILE = resolve(__dirname, 'dto/tenant.dto.ts');
const FRONTEND_STORE_FILE = resolve(
  __dirname,
  '../../../../frontend-vue/src/features/admin/store/tenants.ts',
);

/**
 * Extracts the declared property names of the backend `CreateTenantDto` class
 * body, stopping at the `}` that closes it so sibling classes (UpdateTenantDto,
 * ...) are not picked up. Decorator lines (`@IsEmail()`, `@Transform(...)`)
 * start with `@` and never match the `identifier:` property pattern.
 */
function readDtoProperties(): string[] {
  const source = readFileSync(DTO_FILE, 'utf8');

  const block = /export class CreateTenantDto \{([\s\S]*?)^\}/m.exec(source);
  if (!block) {
    throw new Error(
      `Could not locate the CreateTenantDto class body in ${DTO_FILE}`,
    );
  }

  return extractFieldNames(block[1]);
}

/**
 * Extracts the field names of the object type the frontend `createTenant`
 * action accepts as its `data` argument — the exact shape POSTed to the create
 * endpoint.
 */
function readFrontendPayloadFields(): string[] {
  const source = readFileSync(FRONTEND_STORE_FILE, 'utf8');

  const block = /const createTenant = async \(data: \{([\s\S]*?)\}\) =>/.exec(
    source,
  );
  if (!block) {
    throw new Error(
      `Could not locate the createTenant payload type in ${FRONTEND_STORE_FILE}`,
    );
  }

  return extractFieldNames(block[1]);
}

// Matches `name: string;` / `adminEmail?: string;` property lines, ignoring the
// optional `?`. Decorator and comment lines do not match.
function extractFieldNames(body: string): string[] {
  const names: string[] = [];
  const field = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:/gm;
  let match: RegExpExecArray | null;
  while ((match = field.exec(body)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('create-tenant contract (frontend payload <-> backend CreateTenantDto)', () => {
  const dtoProperties = readDtoProperties();
  const frontendFields = readFrontendPayloadFields();

  it('extracts a non-empty property set from the backend DTO', () => {
    expect(dtoProperties.length).toBeGreaterThan(0);
  });

  it('extracts a non-empty field set from the frontend payload', () => {
    expect(frontendFields.length).toBeGreaterThan(0);
  });

  // The load-bearing assertion: whitelist + forbidNonWhitelisted means any
  // frontend field the DTO omits is a hard 400. Every field the frontend sends
  // MUST be an accepted DTO property.
  it('declares every field the frontend create payload sends', () => {
    const dtoSet = new Set(dtoProperties);
    const missing = frontendFields.filter((field) => !dtoSet.has(field));

    // If this fails, CreateTenantDto is missing the listed field(s): the global
    // ValidationPipe (whitelist + forbidNonWhitelisted) would reject the create
    // request with 400 "property should not exist".
    expect(missing).toEqual([]);
  });

  // Guards the exact Option A drift that motivated this test.
  it('accepts the admin credential fields the create form sends', () => {
    expect(dtoProperties).toContain('adminEmail');
    expect(dtoProperties).toContain('adminPassword');
  });
});
