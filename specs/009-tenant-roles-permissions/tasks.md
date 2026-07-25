---
description: "Task list for Tenant Roles & Permissions implementation"
---

# Tasks: Tenant Roles & Permissions

**Input**: Design documents from `/specs/009-tenant-roles-permissions/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api-endpoints.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Exact file paths are included in the descriptions.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 [P] Define `PERMISSIONS` constants/enums in `backend-nestjs/src/admin/roles/constants/permissions.constant.ts`
- [x] T002 [P] Create initial PostgreSQL migration for roles tables in `backend-nestjs/src/database/migrations/`
- [x] T003 Initialize Roles Module in `backend-nestjs/src/admin/roles/roles.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 [P] Implement `PermissionsGuard` and `@RequirePermissions` decorator in `backend-nestjs/src/common/guards/permissions.guard.ts`
- [x] T005 [P] Update JWT Strategy to parse flattened permissions in `backend-nestjs/src/core/auth/jwt.strategy.ts`
- [x] T006 Add base frontend RBAC utility functions in `frontend-vue/src/core/auth/rbac.utils.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Custom Role Management & Hierarchy (Priority: P1) 🎯 MVP

**Goal**: Administrators need to create and configure custom roles, including defining hierarchies, to adapt system access.

**Independent Test**: Can be fully tested by creating a base role, creating a superior role that inherits from the base role, and verifying that assigning the superior role grants the combined permissions via the API.

### Implementation for User Story 1

- [x] T007 [P] [US1] Create Role and RoleInheritance TypeORM entities in `backend-nestjs/src/admin/roles/entities/role.entity.ts`
- [x] T008 [US1] Implement RolesService for CRUD and hierarchy in `backend-nestjs/src/admin/roles/services/roles.service.ts`
- [x] T009 [US1] Implement RolesController matching API contracts 1-4 in `backend-nestjs/src/admin/roles/controllers/roles.controller.ts`
- [x] T010 [P] [US1] Create Vue Pinia store for roles in `frontend-vue/src/features/admin/store/roles.store.ts`
- [x] T011 [US1] Create RolesList and RoleEditor Vue components in `frontend-vue/src/features/admin/components/RolesList.vue` and `RoleEditor.vue`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently. Roles can be created, updated, deleted, and inherited.

---

## Phase 4: User Story 2 - User Role Assignment & Delegation (Priority: P1)

**Goal**: Administrators and delegated staff need to assign roles to users so that individuals only have access to necessary features.

**Independent Test**: Can be fully tested by assigning a role to a user via the API and verifying the flattened permissions appear in the JWT upon next login.

### Implementation for User Story 2

- [x] T012 [P] [US2] Create UserRole TypeORM entity in `backend-nestjs/src/admin/roles/entities/user-role.entity.ts`
- [x] T013 [US2] Implement user role assignment endpoint in `backend-nestjs/src/admin/roles/controllers/user-roles.controller.ts`
- [x] T014 [P] [US2] Update auth service to flatten roles into JWT upon login in `backend-nestjs/src/core/auth/auth.service.ts`
- [x] T015 [US2] Implement role assignment UI in `frontend-vue/src/features/admin/components/UserManagement.vue`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. Users can now securely log in with inherited permissions.

---

## Phase 5: User Story 3 - Granular Permission Control (Priority: P2)

**Goal**: Administrators need to view and select from a comprehensive list of granular permissions.

**Independent Test**: Can be tested by verifying that specific granular permissions are fetched from the API and correctly rendered grouped by module in the frontend.

### Implementation for User Story 3

- [x] T016 [P] [US3] Implement permissions list endpoint in `backend-nestjs/src/admin/roles/controllers/permissions.controller.ts`
- [x] T017 [US3] Integrate grouped permission checkboxes into `frontend-vue/src/features/admin/components/RoleEditor.vue`

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T018 [P] Add unit tests for flattened permission calculation in `backend-nestjs/test/roles.service.spec.ts`
- [x] T019 [P] Run `quickstart.md` end-to-end validation scenarios manually to verify tenant isolation.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - Integrates with US1 for role definitions.
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - Enhances the UI built in US1.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel
- Models/Entities within a story marked [P] can run in parallel with Frontend stores.

---

## Parallel Example: User Story 1

```bash
# Launch Models and Frontend Stores concurrently:
Task T007: "Create Role and RoleInheritance TypeORM entities in backend-nestjs/src/admin/roles/entities/role.entity.ts"
Task T010: "Create Vue Pinia store for roles in frontend-vue/src/features/admin/store/roles.store.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories

---

## Phase 7: Reconciliation (2026-07-24)

**Purpose**: Close coverage gaps found by `speckit-analyze` against `spec.md`. Tasks
below backfill requirements that the shipped code already satisfies (marked `[x]`
with the real file reference) and surface the one requirement still unmet (`[ ]`).

**Note**: Tasks T005 and T014 describe a "flatten permissions into the JWT" design
(`src/core/auth/jwt.strategy.ts`, `src/core/auth/auth.service.ts`) that the shipped
code deliberately abandoned. Permissions are excluded from the JWT and resolved
dynamically at `src/auth/auth.guard.ts:68`. The named files do not exist. Their
descriptions are stale and should be read as historical intent, not current design.

- [x] T020 [US1] (FR-001) Seed exactly one `is_system_default` role on tenant provisioning — implemented at `backend-nestjs/src/database/schema.service.ts:69-76`. Naming drift: seeded as `'Super Administrador'`, spec/data-model say "Administrator" (pending product decision on canonical name).
- [x] T021 [US1] (FR-008) Deletion guards (block delete when users assigned or roles inherit) — implemented via DB `ON DELETE RESTRICT` (`backend-nestjs/src/database/tenant-migrations/index.ts:47,53`) translated to HTTP 409 (`roles.service.ts:351-360`).
- [x] T022 [US1] (FR-004) Dynamic parent→child permission propagation — implemented via recursive CTE at read time (`backend-nestjs/src/admin/roles/queries/flattened-permissions.query.ts:41-54`).
- [x] T023 [US1] (Assumption) Cyclic-inheritance prevention (self + transitive) — implemented at `roles.service.ts:305,317` with a per-tenant advisory lock guarding the check-then-write race.
- [x] T024 [US1] (FR-009) Guard the system-default role against alteration of its name, permissions, and inheritance — implemented at `backend-nestjs/src/admin/roles/services/roles.service.ts` (`update()` now rejects name/permissions/inheritance changes when `isSystemDefault`, description stays editable). Covered by tests in `roles.service.spec.ts` ("system default role protection (FR-009)"), including the empty-permissions lockout case.
- [ ] T025 (C1) Add acceptance note to frontend tasks T011/T015/T017: user actions notify via non-blocking Toasts, never native `alert()` (constitution IV).
