# Tasks: Quick Onboarding (Actionable Empty States & Gamified Checklist)

**Input**: Design documents from `/specs/011-tenant-onboarding/`

**Prerequisites**: plan.md, spec.md, data-model.md, contracts/api.md, research.md, quickstart.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create the NestJS module skeleton and register it in the application

- [ ] T001 Create `OnboardingProgress` TypeORM entity in `backend-nestjs/src/onboarding/entities/onboarding-progress.entity.ts`
- [ ] T002 Create `OnboardingModule` with entity registration in `backend-nestjs/src/onboarding/onboarding.module.ts`
- [ ] T003 Register `OnboardingModule` in the root `AppModule` imports in `backend-nestjs/src/app.module.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema changes that MUST be complete before any user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Add `is_demo BOOLEAN NOT NULL DEFAULT false` column to the `cycles` table DDL inside `backend-nestjs/src/database/schema.service.ts` `seedTenantSchema()`
- [ ] T005 [P] Add `is_demo BOOLEAN NOT NULL DEFAULT false` column to the `pdf_design_templates` table DDL inside `backend-nestjs/src/database/schema.service.ts` `seedTenantSchema()`
- [ ] T006 [P] Add `is_demo BOOLEAN NOT NULL DEFAULT false` column to the `syllabus` table DDL inside `backend-nestjs/src/database/schema.service.ts` `seedTenantSchema()`
- [ ] T007 Add `CREATE TABLE IF NOT EXISTS onboarding_progress` DDL to `backend-nestjs/src/database/schema.service.ts` `seedTenantSchema()`
- [ ] T008 Write and execute a one-time SQL migration script to add the `is_demo` column and `onboarding_progress` table to all existing tenant schemas in the development database

**Checkpoint**: Schema ready — all tenant schemas support `is_demo` flags and `onboarding_progress` tracking

---

## Phase 3: User Story 1 — Actionable Empty States (Priority: P1) 🎯 MVP

**Goal**: New tenants see premium empty-state cards with a "Cargar Datos Demo" button that seeds sample records, instead of a blank screen

**Independent Test**: A tenant with 0 cycles logs in, clicks "Cargar Datos Demo", and immediately sees cycles, syllabus entries, and dashboard stats populated

### Backend Implementation

- [ ] T009 [US1] Create `OnboardingService` with `seedDemoData()` method that transactionally inserts 1 demo Cycle, 2 CycleWeeks, 1 PdfDesignTemplate, 1 Syllabus, and 2 SyllabusDistribution records (all with `is_demo = true`) inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T010 [US1] Add `hasDemoData()` helper method to `OnboardingService` that checks if any records with `is_demo = true` exist in the tenant schema inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T011 [US1] Add `hasRealCycles()` helper method to `OnboardingService` that checks if any cycles with `is_demo = false` exist, to guard the seed-demo endpoint inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T012 [US1] Create `OnboardingController` with `@Post('seed-demo')` endpoint that calls `seedDemoData()` and returns the seeded cycle ID inside `backend-nestjs/src/onboarding/onboarding.controller.ts`

### Frontend Implementation

- [ ] T013 [P] [US1] Create Pinia store `useOnboardingStore` with `seedDemo()` action and `hasDemoData` state in `frontend-vue/src/features/onboarding/store/onboarding.ts`
- [ ] T014 [P] [US1] Create `OnboardingEmptyState.vue` reusable component with premium illustration, descriptive text, "Cargar Datos Demo" and "Crear manualmente" action buttons in `frontend-vue/src/features/onboarding/components/OnboardingEmptyState.vue`
- [ ] T015 [US1] Integrate `OnboardingEmptyState` into the academic-time page, showing it conditionally when no cycles exist in `frontend-vue/src/pages/academic-time/index.vue`
- [ ] T016 [US1] Integrate `OnboardingEmptyState` into the catalogs page, showing it conditionally when no courses are configured for the tenant in `frontend-vue/src/pages/catalogs/index.vue`

**Checkpoint**: At this point, a new tenant can load demo data and see populated sections — User Story 1 is fully functional and testable independently

---

## Phase 4: User Story 2 — Onboarding Progress Checklist (Priority: P2)

**Goal**: A floating checklist widget on the dashboard tracks 4 setup milestones with animated progress and guides the user through initial configuration

**Independent Test**: Coordinator logs in, sees the checklist at 0%, completes one task, and sees the progress jump to 25% with the step checked off

### Backend Implementation

- [ ] T017 [US2] Add `getProgress()` method to `OnboardingService` that queries `onboarding_progress` and dynamically checks step completion against actual tenant data (cycles exist, templates exist, syllabus exists, materials generated) inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T018 [US2] Add `@Get('progress')` endpoint to `OnboardingController` that returns the full progress payload (steps, percentage, dismissed state) per the API contract inside `backend-nestjs/src/onboarding/onboarding.controller.ts`

### Frontend Implementation

- [ ] T019 [P] [US2] Add `fetchProgress()` action, `stepsCompleted`, `progressPercentage`, and `isDismissed` state to `useOnboardingStore` in `frontend-vue/src/features/onboarding/store/onboarding.ts`
- [ ] T020 [US2] Create `OnboardingChecklistWidget.vue` component with floating card layout, animated progress bar, step list with checkmarks, and micro-animations (confetti on completion) in `frontend-vue/src/features/onboarding/components/OnboardingChecklistWidget.vue`
- [ ] T021 [US2] Integrate `OnboardingChecklistWidget` into the tenant dashboard page, fetching progress on mount and conditionally rendering based on `isDismissed` state in `frontend-vue/src/pages/index.vue`

**Checkpoint**: At this point, User Stories 1 AND 2 both work independently — the dashboard shows live progress reflecting actions taken via empty states

---

## Phase 5: User Story 3 — Onboarding State Dismissal and Reset (Priority: P3)

**Goal**: The checklist widget can be minimized/dismissed, and the admin can purge all demo data and reset onboarding from settings

**Independent Test**: Admin clicks "Omitir configuración", widget disappears; admin clicks "Limpiar Datos Demo" in settings, all demo records are deleted and checklist resets to 0%

### Backend Implementation

- [ ] T022 [US3] Add `dismissOnboarding()` method to `OnboardingService` that sets `is_dismissed = true` on the `onboarding_progress` record inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T023 [US3] Add `@Patch('dismiss')` endpoint to `OnboardingController` per the API contract inside `backend-nestjs/src/onboarding/onboarding.controller.ts`
- [ ] T024 [US3] Add `clearDemoData()` method to `OnboardingService` that deletes all `is_demo = true` records across `syllabus`, `pdf_design_templates`, and `cycles` tables in a single transaction, and resets `onboarding_progress.steps_completed` to `[]` inside `backend-nestjs/src/onboarding/onboarding.service.ts`
- [ ] T025 [US3] Add `@Post('clear-demo')` endpoint to `OnboardingController` per the API contract inside `backend-nestjs/src/onboarding/onboarding.controller.ts`

### Frontend Implementation

- [ ] T026 [P] [US3] Add `dismissChecklist()` and `clearDemoData()` actions to `useOnboardingStore` in `frontend-vue/src/features/onboarding/store/onboarding.ts`
- [ ] T027 [US3] Add minimize toggle (collapse to floating bubble icon) and "Omitir configuración" dismiss button with confirmation modal to `OnboardingChecklistWidget.vue` in `frontend-vue/src/features/onboarding/components/OnboardingChecklistWidget.vue`
- [ ] T028 [US3] Add "Limpiar Datos Demo" action card with confirmation modal in the tenant settings or profile section in `frontend-vue/src/pages/config/index.vue`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T029 [P] Add premium CSS animations and transitions (progress bar fill, step checkmark reveal, confetti burst at 100%) to `OnboardingChecklistWidget.vue` in `frontend-vue/src/features/onboarding/components/OnboardingChecklistWidget.vue`
- [ ] T030 [P] Add responsive styling and dark-mode support to `OnboardingEmptyState.vue` in `frontend-vue/src/features/onboarding/components/OnboardingEmptyState.vue`
- [ ] T031 Run quickstart.md validation scenarios end-to-end against a fresh tenant

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - US1 (Phase 3) can proceed independently after Phase 2
  - US2 (Phase 4) depends on Phase 2 only (reads existing tenant data dynamically)
  - US3 (Phase 5) depends on US1 (needs `is_demo` records to purge) and US2 (needs widget to dismiss)
- **Polish (Phase 6)**: Depends on all user stories being complete

### Within Each User Story

- Backend service methods before controller endpoints
- Controller endpoints before frontend store actions
- Frontend store before frontend components
- Components before page integration

### Parallel Opportunities

- T004, T005, T006 can run in parallel (different column additions in same file, but non-conflicting)
- T013, T014 can run in parallel (different files: store vs component)
- T019 can run in parallel with T020 preparation (store vs component)
- T026 can run in parallel with T027 preparation (store vs component)
- T029, T030 can run in parallel (different component files)

---

## Parallel Example: User Story 1

```bash
# Backend (sequential — same service file):
Task T009: "Create OnboardingService with seedDemoData()"
Task T010: "Add hasDemoData() to OnboardingService"
Task T011: "Add hasRealCycles() to OnboardingService"
Task T012: "Create OnboardingController with POST seed-demo"

# Frontend (parallel — different files):
Task T013: "Create useOnboardingStore with seedDemo()"       # store file
Task T014: "Create OnboardingEmptyState.vue component"        # component file

# Frontend integration (sequential — depends on T013+T014):
Task T015: "Integrate into academic-time page"
Task T016: "Integrate into catalogs page"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001–T003)
2. Complete Phase 2: Foundational (T004–T008)
3. Complete Phase 3: User Story 1 (T009–T016)
4. **STOP and VALIDATE**: Test with a fresh tenant — verify empty states appear and demo seeding works
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Polish pass → Final validation with quickstart.md

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
