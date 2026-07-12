# Research & Technical Decisions: Tenant Roles & Permissions

## 1. Storage of Granular Permissions
**Context**: The system needs a predefined list of granular permissions (e.g., `MANAGE_USERS`, `VIEW_SYLLABUS`).
**Decision**: Store permissions as an `enum` or constants in the application code (TypeScript), rather than as rows in the tenant's database schema.
**Rationale**: Permissions are tightly coupled with application logic (Guards, Interceptors). Storing them in the database per-tenant leads to synchronization issues when new features (and permissions) are released.
**Alternatives considered**: Seeding a `permissions` table in every tenant's schema on tenant creation. Rejected because it complicates migrations and adds unnecessary DB joins.

## 2. Role Inheritance Modeling
**Context**: A role can inherit from one or more base roles.
**Decision**: Create a many-to-many table `role_inheritance` (`parent_role_id`, `child_role_id`) within the tenant schema.
**Rationale**: Supports multiple inheritance (a Coordinator inheriting from both Teacher and Reviewer). It aligns with PostgreSQL relational design.
**Alternatives considered**: Self-referencing `parent_id` on the `roles` table. Rejected because it only supports single inheritance.

## 3. Enforcing Tenant Isolation (Schema-per-tenant)
**Context**: The Constitution forbids Row-Level Tenancy.
**Decision**: The tables `roles`, `user_roles`, and `role_inheritance` will be created within the specific schema of each tenant. The NestJS application will continue using its dynamic schema-switching mechanism to route queries to the correct schema.
**Rationale**: Strictly adheres to the Constitution's mandate for `Schema-per-tenant` isolation.
**Alternatives considered**: A global `roles` table with `tenant_id`. Rejected outright as an anti-pattern according to the project Constitution.

## 4. Flattening Permissions for User Sessions
**Context**: A user may have multiple roles, and those roles may inherit from others. Calculating this on every request is expensive.
**Decision**: Calculate the flattened union of permissions at login time and encode them in the JWT token (or a fast-access Redis cache if tokens become too large).
**Rationale**: Ensures high performance (low latency) for API requests, avoiding recursive SQL queries on every guarded endpoint.
**Alternatives considered**: Querying the database on every request using recursive CTEs. Rejected due to performance concerns at scale.
