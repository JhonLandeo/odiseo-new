# Tasks: B2B Tenant Dashboard with Cycle Breakdown

**Input**: Design documents from `/specs/010-tenant-dashboard/`

**Prerequisites**: spec.md, plan.md, data-model.md

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Backend Aggregation API

- [x] T001 [P] [US1] Create dynamic DB metrics query inside `backend-nestjs/src/materials/materials.service.ts`
- [x] T002 [US1] Expose `@Get('dashboard/metrics')` route mapping inside `backend-nestjs/src/materials/materials.controller.ts`

---

## Phase 2: Frontend Store Integration

- [x] T003 [P] [US1] Add `fetchDashboardMetrics()` action inside Pinia store `frontend-vue/src/features/materials/store/materials.ts`

---

## Phase 3: Dashboard Layout and Templates

- [x] T004 [US1] Implement Bento grid stats cards and skeletons in `frontend-vue/src/pages/index.vue`
- [x] T005 [US2] Implement "Consumo por Ciclo" comparative breakdown list in `frontend-vue/src/pages/index.vue`
- [x] T006 [US3] Add cycle tags in recent activity table inside `frontend-vue/src/pages/index.vue`
- [x] T007 [P] [US1] Prevent super admin (`odiseo`) from landing on this page by keeping the `/admin/dashboard` redirect in `frontend-vue/src/pages/index.vue`
