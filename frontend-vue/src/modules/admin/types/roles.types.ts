/**
 * Contratos del módulo de roles, espejo de `backend-nestjs/src/admin/roles`.
 * Los nombres de campo se comparan literalmente contra los DTO del backend:
 * un typo aquí no rompe la compilación, simplemente viaja un payload que el
 * ValidationPipe descarta en silencio.
 */

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  isSystemDefault: boolean;
  permissions: string[];
  inheritedRoles?: Role[];
  createdAt?: string;
  updatedAt?: string;
}

/** Espejo de `CreateRoleDto`: solo `name` es obligatorio. */
export interface CreateRoleDto {
  name: string;
  description?: string;
  permissions?: string[];
  inheritedRoleIds?: string[];
}

/** Espejo de `UpdateRoleDto`: todos los campos son opcionales (PATCH parcial). */
export interface UpdateRoleDto {
  name?: string;
  description?: string;
  permissions?: string[];
  inheritedRoleIds?: string[];
}
