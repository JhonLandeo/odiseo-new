# API Contracts: Tenant Roles & Permissions

All endpoints below require authentication and are scoped to the current tenant via the `x-subdomain` or tenant context headers.

## Roles API

### 1. List Roles
- **Method**: `GET`
- **Path**: `/api/v1/admin/roles`
- **Response** (200 OK):
  ```json
  {
    "data": [
      {
        "id": "uuid",
        "name": "Docente",
        "isSystemDefault": false,
        "permissions": ["VIEW_SYLLABUS", "VIEW_MATERIALS"]
      }
    ]
  }
  ```

### 2. Create Role
- **Method**: `POST`
- **Path**: `/api/v1/admin/roles`
- **Body**:
  ```json
  {
    "name": "Coordinador Académico",
    "description": "Supervisa a los docentes",
    "permissions": ["MANAGE_USERS", "EDIT_SYLLABUS"],
    "inheritedRoleIds": ["uuid-of-docente-role"]
  }
  ```
- **Response** (201 Created): Role object. Fields are serialized in camelCase
  (`isSystemDefault`, `inheritedRoles`, `createdAt`, `updatedAt`), mirroring the
  TypeORM entity — no snake_case conversion layer is applied.

  > **Field naming**: request bodies for role create/update use camelCase
  > (`inheritedRoleIds`), matching `CreateRoleDto`/`UpdateRoleDto`. Only the
  > user-role assignment endpoint (#5) uses `role_ids`, matching `AssignRolesDto`.

### 3. Update Role
- **Method**: `PATCH`
- **Path**: `/api/v1/admin/roles/:id`
- **Body**: Same structure as Create (all fields optional).

### 4. Delete Role
- **Method**: `DELETE`
- **Path**: `/api/v1/admin/roles/:id`
- **Response**: 204 No Content. Returns 409 Conflict if users are assigned or if other roles inherit from it.

## User Roles API

### 5. Assign Roles to User
- **Method**: `PUT`
- **Path**: `/api/v1/admin/users/:userId/roles`
- **Body**:
  ```json
  {
    "role_ids": ["uuid-1", "uuid-2"]
  }
  ```
- **Response**: 200 OK. Overwrites existing assignments.

## Permissions API

### 6. List Available Permissions
- **Method**: `GET`
- **Path**: `/api/v1/admin/permissions`
- **Response** (200 OK):
  ```json
  {
    "data": [
      {
        "module": "Syllabus",
        "permissions": [
          { "code": "VIEW_SYLLABUS", "description": "Ver plan de estudios" },
          { "code": "EDIT_SYLLABUS", "description": "Modificar plan de estudios" }
        ]
      },
      {
        "module": "Admin",
        "permissions": [
          { "code": "MANAGE_ROLES", "description": "Crear y editar roles" }
        ]
      }
    ]
  }
  ```
