# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]

**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Implement a flexible, hierarchical Role-Based Access Control (RBAC) system for tenants. Each tenant starts with a single Administrator role and can create custom roles with granular permissions defined by the platform. Roles can inherit from one another to model complex school hierarchies. The feature will be implemented in NestJS with PostgreSQL, enforcing strict schema-per-tenant isolation and flattened permission calculations for performant API authorization.

## Technical Context

**Language/Version**: TypeScript (Node.js)

**Primary Dependencies**: NestJS, PostgreSQL

**Storage**: PostgreSQL (Schema-per-tenant)

**Testing**: Jest (Backend), Vitest (Frontend)

**Target Platform**: SaaS B2B Web Application

**Project Type**: Web application (frontend + backend)

**Performance Goals**: Sub-50ms permission resolution during request validation (using flattened JWTs or caching).

**Constraints**: Strict schema isolation (no row-level tenancy for role data), English snake_case database schema names.

**Scale/Scope**: Scales horizontally per tenant; high read volume (auth checks), low write volume (role modification).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Separation of Domains**: Valid. Implementation strictly within the SaaS B2B domain.
- [x] **Clean Architecture**: Valid. Permissions modeled independently of DB structure in application code.
- [x] **Quality Standards**: Valid. New PostgreSQL tables will use snake_case English names.
- [x] **Scalability Assumptions**: Valid. Schema-per-tenant used for role isolation. Row-level tenancy avoided.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
backend-nestjs/
├── src/
│   ├── admin/
│   │   ├── roles/             # Roles & Permissions module
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── dto/
│   │   │   └── entities/      # Role, UserRole, RoleInheritance
│   │   └── users/             # (Update existing to integrate role assignment)
│   └── common/
│       ├── guards/            # PermissionGuards
│       └── decorators/        # @RequirePermissions()
└── test/

frontend-vue/
├── src/
│   ├── modules/
│   │   ├── admin/
│   │   │   ├── views/
│   │   │   │   ├── RolesList.vue
│   │   │   │   └── RoleEditor.vue
│   │   │   ├── store/
│   │   │   └── components/
│   └── core/
│       └── auth/              # RBAC utility functions
```

**Structure Decision**: The logic will be added to the existing `backend-nestjs` and `frontend-vue` apps, structured as a new `roles` feature module under the `admin` domain.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*No violations detected. Standard multi-tenant table structures apply.*
