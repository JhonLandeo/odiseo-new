# Quickstart: Tenant Roles & Permissions

This guide documents the validation scenarios to prove the feature works end-to-end.

## Setup

1. **Database Preparation**:
   Run database migrations to ensure the `roles`, `user_roles`, and `role_inheritance` tables exist in a test tenant schema (e.g., `tenant_demo`).

2. **Start Backend & Frontend**:
   Ensure both NestJS and Vue are running locally.
   - Backend: `npm run start:dev`
   - Frontend: `npm run dev`

## Validation Scenarios

### Scenario 1: Verify Default Administrator Role
1. Call the `POST /api/v1/admin/tenants` endpoint to provision a new test tenant.
2. Log in as the generated tenant administrator.
3. Call `GET /api/v1/admin/roles`.
4. **Expected Outcome**: Exactly one role named "Administrator" is returned, with `is_system_default` set to `true`.

### Scenario 2: Create Role with Inheritance
1. Call `GET /api/v1/admin/permissions` to retrieve valid permission codes.
2. Call `POST /api/v1/admin/roles` to create a base role (e.g., "Docente") with permission `VIEW_SYLLABUS`.
3. Call `POST /api/v1/admin/roles` to create a child role (e.g., "Coordinador") with permission `EDIT_SYLLABUS`, passing the Docente role's ID in `inherited_role_ids`.
4. **Expected Outcome**: The response for Coordinador returns a 201 Created. A subsequent `GET /api/v1/admin/roles` should show both roles.

### Scenario 3: Prevent Deletion of Active/Inherited Roles
1. Attempt to delete the "Docente" role using `DELETE /api/v1/admin/roles/:docenteId`.
2. **Expected Outcome**: The API returns `409 Conflict` because the Coordinador role inherits from it.
3. Attempt to delete the "Administrator" role.
4. **Expected Outcome**: The API returns `409 Conflict` or `403 Forbidden` because it is `is_system_default`.

### Scenario 4: User Flattened Permissions
1. Assign the "Coordinador" role to a test user using `PUT /api/v1/admin/users/:userId/roles`.
2. Log in as that test user to retrieve the new JWT access token.
3. Inspect the decoded token or call a `/me` endpoint.
4. **Expected Outcome**: The user's resolved permissions include *both* `EDIT_SYLLABUS` (from Coordinador) and `VIEW_SYLLABUS` (inherited from Docente).

### Scenario 5: Tenant Isolation
1. Create a second test tenant (`tenant_demo2`).
2. Log in as the administrator of `tenant_demo2`.
3. Call `GET /api/v1/admin/roles`.
4. **Expected Outcome**: The API only returns the default Administrator for `tenant_demo2`, and the "Docente" and "Coordinador" roles created in `tenant_demo` are completely invisible.
