/**
 * Canonical permission vocabulary.
 *
 * This MUST mirror the backend source of truth exactly:
 * `backend-nestjs/src/admin/roles/constants/permissions.constant.ts`
 *
 * `GET /api/v1/auth/me` returns these UPPERCASE codes verbatim, and the auth
 * store compares them with a strict `includes()`. Any divergence silently
 * makes routes unreachable, so `permissions.contract.spec.ts` asserts both
 * files stay in sync.
 */
export const PERMISSIONS = {
  // Module: Admin
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_TENANTS: 'MANAGE_TENANTS',

  // Module: Tenant Admin Management
  LIST_TENANT_ADMINS: 'LIST_TENANT_ADMINS',
  CREATE_TENANT_ADMINS: 'CREATE_TENANT_ADMINS',
  EDIT_TENANT_ADMINS: 'EDIT_TENANT_ADMINS',
  CHANGE_PASSWORD_TENANT_ADMINS: 'CHANGE_PASSWORD_TENANT_ADMINS',
  DELETE_TENANT_ADMINS: 'DELETE_TENANT_ADMINS',

  // Module: Syllabus
  VIEW_SYLLABUS: 'VIEW_SYLLABUS',
  EDIT_SYLLABUS: 'EDIT_SYLLABUS',

  // Module: Academic Time
  VIEW_ACADEMIC_TIME: 'VIEW_ACADEMIC_TIME',
  MANAGE_ACADEMIC_TIME: 'MANAGE_ACADEMIC_TIME',

  // Module: Catalogs
  VIEW_CATALOGS: 'VIEW_CATALOGS',
  EDIT_CATALOGS: 'EDIT_CATALOGS',

  // Module: Materials
  VIEW_MATERIALS: 'VIEW_MATERIALS',
  EDIT_MATERIALS: 'EDIT_MATERIALS',
} as const;

/** Union of every valid permission code. */
export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Key form of a permission (identical to its value by construction). */
export type PermissionKey = keyof typeof PERMISSIONS;
