# Feature Specification: Roles and Permissions for Tenants

**Feature Branch**: `[009-tenant-roles-permissions]`

**Created**: 2026-07-12

**Status**: Implemented (backend). Verified against code on 2026-07-24; see `contracts/api-endpoints.md` for the live request/response field naming.

**Input**: User description: "quiero plantear los roles y premisos para los tenants, a que considerar que cada colegio lo maneja de una manera distinta, por ello a que plantear algo que sirva para todos ellos"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Custom Role Management & Hierarchy (Priority: P1)

Administrators (or users with delegation permissions) need to create and configure custom roles, including defining hierarchies, so that they can adapt the system access to their school's specific organizational structure.

**Why this priority**: It is the foundation for flexible permissions. Without custom roles and inheritance, schools cannot map their unique hierarchies (e.g., Coordinator inherits Teacher permissions) into the system efficiently.

**Independent Test**: Can be fully tested by creating a base role, creating a superior role that inherits from the base role, and verifying that assigning the superior role grants the combined permissions.

**Acceptance Scenarios**:

1. **Given** a new tenant is created, **When** they first access the system, **Then** they only have a single "Administrator" role and must build the rest from scratch.
2. **Given** an administrator is creating a new role, **When** they select an existing role to inherit from (e.g., "Docente"), **Then** the new role automatically gains all permissions of the inherited role, plus any specific ones added.
3. **Given** an existing custom role that has users assigned, **When** an administrator attempts to delete it, **Then** the system warns the administrator and requires reassigning those users before deletion can proceed.
4. **Given** a change in a base role's permissions, **When** the base role is updated, **Then** all roles that inherit from it automatically reflect the updated permissions.

---

### User Story 2 - User Role Assignment & Delegation (Priority: P1)

Administrators and delegated staff need to assign roles to users so that individuals only have access to the features and data necessary for their job.

**Why this priority**: Essential for enforcing security and access control at the user level, and allows distributing the administrative workload.

**Independent Test**: Can be fully tested by assigning a role to a user, and verifying that a user with "Manage Roles" permission can also perform role assignments.

**Acceptance Scenarios**:

1. **Given** an active user account, **When** an administrator assigns a custom role to the user, **Then** the user immediately gains the permissions associated with that role.
2. **Given** a user with a delegated role that includes the "Manage Users and Roles" permission, **When** they access the system, **Then** they can create new roles and assign them to other users.
3. **Given** a user acting in multiple capacities, **When** an administrator assigns multiple roles to them, **Then** the user receives the combined (union) permissions of all assigned roles and their respective inherited roles.

---

### User Story 3 - Granular Permission Control (Priority: P2)

Administrators need to view and select from a comprehensive list of granular permissions so that they can build highly specific roles (e.g., "Can view materials but cannot edit").

**Why this priority**: Provides the flexibility needed to accommodate different school policies, preventing over-privileged or under-privileged accounts.

**Independent Test**: Can be tested by verifying that specific granular permissions correctly restrict user actions in the respective modules.

**Acceptance Scenarios**:

1. **Given** the role creation/edit screen, **When** an administrator views available permissions, **Then** they see permissions grouped by module for easy selection.

### Edge Cases

- What happens when a user's assigned role is deleted? (System prevents deletion until users are reassigned).
- What happens if a base role is deleted while other roles inherit from it? (System prevents deletion until the inheritance relationship is removed).
- How does the system handle a user who has no roles assigned? (User has read-only access to their own profile, but no module access).
- What happens if a school tries to delete the primary administrative role? (System prevents deletion of the core Admin role).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST start each new tenant with exactly one predefined role ("Administrator") and no other default roles.
- **FR-002**: System MUST allow users with the appropriate permissions to create, read, update, and delete custom roles within their own organization.
- **FR-003**: System MUST support role hierarchy, allowing a custom role to inherit permissions from one or more existing roles within the tenant.
- **FR-004**: System MUST dynamically propagate permission changes from a parent/base role to all roles that inherit from it.
- **FR-005**: System MUST provide a predefined list of granular permissions grouped by functional modules, explicitly including administrative permissions like "Manage Roles" and "Manage Users".
- **FR-006**: System MUST allow administrators (or delegated users) to assign one or multiple roles to a user.
- **FR-007**: System MUST enforce access control across all modules based on the cumulative permissions granted to the user's assigned roles and inherited hierarchies.
- **FR-008**: System MUST prevent the deletion of a role if there are active users assigned to it, or if other roles currently inherit from it.
- **FR-009**: System MUST prevent the deletion or alteration of the primary "Tenant Administrator" role.
- **FR-010**: System MUST ensure that roles and permissions created by one tenant are completely isolated and invisible to other tenants.

### Key Entities *(include if feature involves data)*

- **Role**: A custom named entity created by a tenant containing a set of permissions, and optional links to base roles it inherits from.
- **Permission**: A predefined granular right to perform a specific action or access specific data in the system.
- **UserRole**: The assignment linking a user to one or more roles within a tenant context.
- **RoleInheritance**: A relationship mapping that defines which roles inherit permissions from which other roles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can create a custom role with inheritance and assign it to a user in under 2 minutes.
- **SC-002**: 100% of unauthorized access attempts are blocked based on the configured permissions.
- **SC-003**: Schools can map their existing organizational structure (including hierarchies) into the system without requiring developer intervention.
- **SC-004**: Zero data leakage between tenants regarding their custom roles and permission configurations.

## Assumptions

- Users have stable internet connectivity.
- A standard set of granular permissions covering all current system features will be predefined by the platform developers.
- The existing authentication system will be reused and extended to include permission claims.
- Role changes and inheritance propagation take effect immediately on the next user action without requiring a logout/login, or at most require a token refresh.
- Cyclic inheritance (Role A inherits Role B inherits Role A) will be prevented by the system at the time of role creation/update.
