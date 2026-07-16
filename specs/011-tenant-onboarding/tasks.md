# Tasks: Quick Onboarding (Spotlight Walkthrough & No Demo Data)

**Input**: Design documents from `/specs/011-tenant-onboarding/`
**Prerequisites**: plan.md, spec.md

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel
- **[Story]**: Which user story this task belongs to (US1, US2)

---

## Phase 1: Backend Infrastructure (Onboarding State)
**Purpose**: Create the backend structure to track onboarding progress per tenant.

- [ ] T001 [US1] Create `OnboardingProgress` TypeORM entity (`tenant_id`, `steps_completed` JSONB array, `is_dismissed` BOOLEAN) in `backend-nestjs/src/onboarding/entities/onboarding-progress.entity.ts`
- [ ] T002 [US1] Create `OnboardingModule`, `OnboardingService`, and `OnboardingController` in `backend-nestjs/src/onboarding/`
- [ ] T003 [US1] Register `OnboardingModule` in `backend-nestjs/src/app.module.ts`
- [ ] T004 [US1] Add `CREATE TABLE IF NOT EXISTS onboarding_progress` DDL to `backend-nestjs/src/database/schema.service.ts` `seedTenantSchema()`
- [ ] T005 [US1] Implement `getProgress()` in `OnboardingService` to dynamically check existence of Cycles, PdfTemplates, Syllabus, and Materials in the tenant schema and return completed steps.
- [ ] T006 [US2] Implement `dismissTour()` and `resetTour()` in `OnboardingService` to set `is_dismissed = true/false` for the tenant.
- [ ] T007 [US1/US2] Expose `GET /onboarding/progress`, `PATCH /onboarding/dismiss`, and `PATCH /onboarding/reset` in `OnboardingController`.

---

## Phase 2: Frontend State Management
**Purpose**: Manage the tour state and interact with the backend API.

- [ ] T008 [P] [US1] Create Pinia store `useOnboardingStore` in `frontend-vue/src/features/onboarding/store/onboarding.ts` with state for `stepsCompleted`, `isDismissed`, and actions `fetchProgress()`, `dismissTour()`, and `resetTour()`.

---

## Phase 3: The Spotlight Tour Component
**Purpose**: Implement the interactive `AppTour.vue` UI component.

- [ ] T009 [US1] Create `AppTour.vue` in `frontend-vue/src/features/onboarding/components/AppTour.vue`. Implement the dark overlay (`z-index`) and the spotlight cutout using CSS/coordinates.
- [ ] T010 [US1] Add dynamic targeting to `AppTour.vue`: compute bounding client rect of a target DOM element (by ID/ref) to position the spotlight and the explanatory popover.
- [ ] T011 [US1] Implement interaction logic: immediately hide the overlay when the target element is clicked, to unblock form interactions. Wait for state updates (e.g., successful form save) to re-evaluate progress and show the next step.
- [ ] T012 [US2] Add the persistent "Saltar tutorial" button to the popover that calls `dismissTour()` and permanently hides the tour.
- [ ] T013 [US1] Integrate `canvas-confetti` to trigger a visual celebration when a step transitions to completed.

---

## Phase 4: Tour Integration & Target Hooks
**Purpose**: Hook the tour into the actual application layout and target elements.

- [ ] T014 [US1] Inject `AppTour.vue` globally in the tenant dashboard layout (e.g., `frontend-vue/src/layouts/b2b.vue`) so it can activate on first login if not dismissed.
- [ ] T015 [US1] Add target IDs/data-attributes to the exact UI action buttons for the 4 steps: "Crear Ciclo", "Crear Plantilla PDF", "Crear Syllabus", "Generar Material".
- [ ] T016 [US2] Add a "Reiniciar Tour" (Reset Tour) button in the tenant settings page (`frontend-vue/src/pages/config/index.vue`) that resets the backend state and restarts the tour.
