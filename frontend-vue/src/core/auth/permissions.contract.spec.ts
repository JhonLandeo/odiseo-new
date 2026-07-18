/**
 * Cross-repository contract test: frontend PERMISSIONS vs backend PERMISSIONS.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * The backend migration `0003_reconcile_super_admin_permissions` moved every
 * permission code to UPPERCASE. The frontend was never updated and kept
 * checking lowercase strings (`view_catalogs`, `generate_material`, ...).
 * Because `auth.store.ts` compares permissions with a strict
 * `permissions.includes(permission)` and applies no normalization, every route
 * declaring `meta.permissions` aborted with 403 — for every user, Super Admin
 * included — leaving 9 routes unreachable. Authenticated tenant users hitting
 * `/login` were additionally force-logged-out by the same mismatch.
 *
 * This test reads the backend constant file straight off disk and asserts the
 * two vocabularies are exactly equal. Its entire purpose is to FAIL loudly the
 * next time either side drifts.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { PERMISSIONS } from './permissions';

// Resolved from this file's own directory so the test is independent of the
// working directory vitest happens to be launched from.
const CURRENT_DIR = dirname(fileURLToPath(String(import.meta.url)));

const BACKEND_PERMISSIONS_FILE = resolve(
  CURRENT_DIR,
  '../../../../backend-nestjs/src/admin/roles/constants/permissions.constant.ts',
);

/**
 * Extracts the `KEY: 'VALUE'` pairs of the backend `PERMISSIONS` object
 * literal, stopping at the `} as const;` that closes it so later constants
 * (TENANT_SUPER_ADMIN_PERMISSIONS, PERMISSIONS_METADATA) are not picked up.
 */
function readBackendPermissions(): Record<string, string> {
  const source = readFileSync(BACKEND_PERMISSIONS_FILE, 'utf8');

  const block = /export const PERMISSIONS = \{([\s\S]*?)\}\s*as const;/.exec(source);
  expect(
    block,
    `Could not locate the PERMISSIONS object literal in ${BACKEND_PERMISSIONS_FILE}`,
  ).not.toBeNull();

  const entries: Record<string, string> = {};
  const pair = /^\s*([A-Z0-9_]+)\s*:\s*'([^']+)'\s*,/gm;

  let match: RegExpExecArray | null;
  while ((match = pair.exec(block![1])) !== null) {
    entries[match[1]] = match[2];
  }

  return entries;
}

describe('permissions contract (frontend <-> backend)', () => {
  const backendPermissions = readBackendPermissions();

  it('extracts a non-empty permission set from the backend file', () => {
    expect(Object.keys(backendPermissions).length).toBeGreaterThan(0);
  });

  it('declares exactly the same permission keys as the backend', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(
      Object.keys(backendPermissions).sort(),
    );
  });

  it('declares exactly the same permission values as the backend', () => {
    expect(PERMISSIONS).toEqual(backendPermissions);
  });

  it('keeps every permission code UPPERCASE, matching what /auth/me returns', () => {
    for (const [key, value] of Object.entries(PERMISSIONS)) {
      expect(value).toBe(value.toUpperCase());
      expect(value).toBe(key);
    }
  });
});
