export const PERMISSIONS = {
  // Module: Admin
  MANAGE_ROLES: 'MANAGE_ROLES',
  MANAGE_USERS: 'MANAGE_USERS',
  
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
