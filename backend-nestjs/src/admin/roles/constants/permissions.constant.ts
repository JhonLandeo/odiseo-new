export const PERMISSIONS = {
  // Module: Admin
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_USERS: 'MANAGE_USERS',
  MANAGE_TENANTS: 'MANAGE_TENANTS',
  
  // Module: Tenant Admin Management (US-007, FR-11 — 5 granular permissions)
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

export type PermissionType = keyof typeof PERMISSIONS;

/**
 * Canonical permission set granted to a tenant's system-default Super Admin
 * (the institution Director). Single source of truth used by both the tenant
 * provisioning seed and the reconciliation migration. Excludes MANAGE_TENANTS,
 * which is a platform-level permission, not an institution-level one.
 */
export const TENANT_SUPER_ADMIN_PERMISSIONS: string[] = [
  PERMISSIONS.MANAGE_ROLES,
  PERMISSIONS.MANAGE_USERS,
  PERMISSIONS.LIST_TENANT_ADMINS,
  PERMISSIONS.CREATE_TENANT_ADMINS,
  PERMISSIONS.EDIT_TENANT_ADMINS,
  PERMISSIONS.CHANGE_PASSWORD_TENANT_ADMINS,
  PERMISSIONS.DELETE_TENANT_ADMINS,
  PERMISSIONS.VIEW_SYLLABUS,
  PERMISSIONS.EDIT_SYLLABUS,
  PERMISSIONS.VIEW_ACADEMIC_TIME,
  PERMISSIONS.MANAGE_ACADEMIC_TIME,
  PERMISSIONS.VIEW_CATALOGS,
  PERMISSIONS.EDIT_CATALOGS,
  PERMISSIONS.VIEW_MATERIALS,
  PERMISSIONS.EDIT_MATERIALS,
];

export const PERMISSIONS_METADATA = [
  {
    module: 'Admin',
    permissions: [
      { code: PERMISSIONS.MANAGE_ROLES, description: 'Crear y editar roles' },
      { code: PERMISSIONS.MANAGE_USERS, description: 'Gestionar usuarios y accesos' },
      { code: PERMISSIONS.MANAGE_TENANTS, description: 'Gestionar inquilinos/empresas' },
    ],
  },
  {
    module: 'Tenant Admin Management',
    permissions: [
      { code: PERMISSIONS.LIST_TENANT_ADMINS, description: 'Listar administradores de empresa' },
      { code: PERMISSIONS.CREATE_TENANT_ADMINS, description: 'Crear administradores de empresa' },
      { code: PERMISSIONS.EDIT_TENANT_ADMINS, description: 'Editar administradores de empresa' },
      { code: PERMISSIONS.CHANGE_PASSWORD_TENANT_ADMINS, description: 'Cambiar contraseña de administradores' },
      { code: PERMISSIONS.DELETE_TENANT_ADMINS, description: 'Eliminar administradores de empresa' },
    ],
  },
  {
    module: 'Syllabus',
    permissions: [
      { code: PERMISSIONS.VIEW_SYLLABUS, description: 'Ver plan de estudios' },
      { code: PERMISSIONS.EDIT_SYLLABUS, description: 'Modificar plan de estudios' },
    ],
  },
  {
    module: 'Academic Time',
    permissions: [
      { code: PERMISSIONS.VIEW_ACADEMIC_TIME, description: 'Ver ciclos y semanas académicas' },
      { code: PERMISSIONS.MANAGE_ACADEMIC_TIME, description: 'Gestionar ciclos, semanas y plantillas' },
    ],
  },
  {
    module: 'Catalogs',
    permissions: [
      { code: PERMISSIONS.VIEW_CATALOGS, description: 'Ver catálogo de cursos y temas' },
      { code: PERMISSIONS.EDIT_CATALOGS, description: 'Gestionar visibilidad de temas' },
    ],
  },
  {
    module: 'Materials',
    permissions: [
      { code: PERMISSIONS.VIEW_MATERIALS, description: 'Ver materiales generados' },
      { code: PERMISSIONS.EDIT_MATERIALS, description: 'Editar o auditar materiales' },
    ],
  },
];
