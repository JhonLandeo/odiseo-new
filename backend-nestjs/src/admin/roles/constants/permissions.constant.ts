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
  
  // Module: Materials
  VIEW_MATERIALS: 'VIEW_MATERIALS',
  EDIT_MATERIALS: 'EDIT_MATERIALS',
} as const;

export type PermissionType = keyof typeof PERMISSIONS;

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
    module: 'Materials',
    permissions: [
      { code: PERMISSIONS.VIEW_MATERIALS, description: 'Ver materiales generados' },
      { code: PERMISSIONS.EDIT_MATERIALS, description: 'Editar o auditar materiales' },
    ],
  },
];
