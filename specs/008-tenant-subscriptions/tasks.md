# Tasks: Gestión de Tenants y Suscripciones

**Input**: Design documents from `/specs/008-tenant-subscriptions/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create Admin Module in `backend-nestjs/src/admin/admin.module.ts`
- [x] T002 [P] Create Admin Layout for frontend in `frontend-vue/src/views/admin/AdminLayout.vue`
- [x] T003 [P] Configure global routing for `/admin` in `frontend-vue/src/router/index.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T004 Implement Database Schema Service for provisioning tenants in `backend-nestjs/src/common/database/schema.service.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Crear y Configurar Nueva Empresa (Tenant) (Priority: P1) 🎯 MVP

**Goal**: Registrar una nueva empresa y asignarle un plan, creando su esquema de DB aislado.

**Independent Test**: Se puede probar registrando un tenant y verificando que el sistema aprovisiona correctamente su esquema de base de datos.

### Implementation for User Story 1

- [x] T005 [P] [US1] Create SubscriptionPlan entity in `backend-nestjs/src/admin/subscriptions/entities/subscription-plan.entity.ts`
- [x] T006 [P] [US1] Create Tenant entity in `backend-nestjs/src/admin/tenants/entities/tenant.entity.ts`
- [x] T007 [US1] Implement TenantsService in `backend-nestjs/src/admin/tenants/tenants.service.ts` (Integrate with SchemaService)
- [x] T008 [US1] Implement TenantsController (`GET`, `POST`, `PATCH /status`) in `backend-nestjs/src/admin/tenants/tenants.controller.ts`
- [x] T009 [P] [US1] Create Pinia store for Tenants in `frontend-vue/src/features/admin/store/tenants.ts`
- [x] T010 [US1] Implement TenantsView in `frontend-vue/src/views/admin/TenantsView.vue`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Gestionar Planes de Suscripción (Priority: P2)

**Goal**: Definir y editar planes de suscripción (ej. Básico, Pro, Enterprise) con límites específicos.

**Independent Test**: Se puede probar creando un plan con restricciones de límite de usuarios y asignándolo a un tenant existente.

### Implementation for User Story 2

- [x] T011 [P] [US2] Implement SubscriptionsService in `backend-nestjs/src/admin/subscriptions/subscriptions.service.ts`
- [x] T012 [US2] Implement SubscriptionsController (`GET`, `POST`) in `backend-nestjs/src/admin/subscriptions/subscriptions.controller.ts`
- [x] T013 [P] [US2] Create Pinia store for Subscriptions in `frontend-vue/src/features/admin/store/subscriptions.ts`
- [x] T014 [US2] Implement SubscriptionsView in `frontend-vue/src/views/admin/SubscriptionsView.vue`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Visualizar Dashboard de Consumo (Priority: P2)

**Goal**: Ver un dashboard con el consumo de recursos de cada empresa (páginas, reactivos, almacenamiento, usuarios).

**Independent Test**: Simular el endpoint de métricas y validar el renderizado del dashboard visualmente.

### Implementation for User Story 3

- [x] T015 [P] [US3] Create ConsumptionMetric entity in `backend-nestjs/src/admin/dashboard/entities/consumption-metric.entity.ts`
- [x] T016 [US3] Implement DashboardService in `backend-nestjs/src/admin/dashboard/dashboard.service.ts`
- [x] T017 [US3] Implement DashboardController (`GET /metrics`) in `backend-nestjs/src/admin/dashboard/dashboard.controller.ts`
- [x] T018 [P] [US3] Create Pinia store for Dashboard in `frontend-vue/src/features/admin/store/dashboard.ts`
- [x] T019 [US3] Implement DashboardView in `frontend-vue/src/views/admin/DashboardView.vue`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T020 [P] Agregar decoradores Swagger a todos los controllers del módulo admin
- [x] T021 [P] Asegurar que las vistas (Tenants, Subscriptions, Dashboard) usen los componentes UI estándar de Odiseo
- [x] T022 Ejecutar la validación manual del `quickstart.md` para confirmar el flujo end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Depende de Phase 2 (SchemaService).
- **User Story 2 (P2)**: Independiente de la creación de Tenant, pero es el paso previo lógico.
- **User Story 3 (P3)**: Requiere Tenants existentes para visualizar métricas.

### Parallel Opportunities

- Creación de entidades TypeORM y stores de Pinia pueden realizarse en paralelo (`[P]`).
- Todo el Frontend (`views` y `stores`) de una fase puede avanzarse si se mockea la API, o trabajarse en paralelo con el Backend.

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 (Creación de Tenant con aprovisionamiento automático)

### Incremental Delivery

1. Foundation ready
2. Add User Story 1 → Demo MVP (Alta de Tenants)
3. Add User Story 2 → Demo (Gestión de Planes)
4. Add User Story 3 → Demo (Dashboard)
