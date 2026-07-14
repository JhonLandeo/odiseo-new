# Implementation Plan: Quick Onboarding

**Branch**: `011-tenant-onboarding` | **Date**: 2026-07-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/011-tenant-onboarding/spec.md`

---

## Summary

This feature provides a frictionless self-guided onboarding flow for new B2B Tenants. 
* **Backend**: Exposes onboarding progress endpoints to track completion of core system configuration (Cycles, Syllabus, Design Templates) without creating demo data.
* **Frontend**: Renders an interactive global Spotlight Walkthrough overlay that darkens the background and highlights real UI buttons step-by-step, firing confetti animations upon successful configuration of each module.

---

## Technical Context

**Language/Version**: TypeScript / Node 24 (Backend), Vue 3 / Nuxt 3 (Frontend)

**Primary Dependencies**: NestJS, TypeORM, Nuxt UI

**Storage**: PostgreSQL (Schema-per-tenant isolation)

**Testing**: Jest (Backend), Vitest (Frontend)

**Target Platform**: Linux Server / AWS ECS

**Project Type**: Multi-tenant Web Application

**Performance Goals**: Tour overlay mask calculation completes in <16ms; overlay loads in <50ms.

**Constraints**: SQL names in English snake_case, tenant data schema isolation, non-blocking Nuxt UI alerts/toasts.

**Scale/Scope**: Up to 10k tenants, 4 core tour setup milestones pointing to real configuration flows.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

1. **Separation of Domains (Core I/II)**: ✅ Pass. The onboarding tour strictly operates within the B2B frontend context.
2. **PostgreSQL snake_case rule (Core IV)**: ✅ Pass. Table `onboarding_progress` and columns use English snake_case.
3. **UX Notification Standards (Core IV)**: ✅ Pass. All alerts, error messages, and success confirmations use Nuxt UI Toast/Modals. No native `alert()` or `confirm()` are utilized.
4. **No Synchronous PDF Compilation (Core VIII)**: ✅ Pass. Creating real materials via the tour still dispatches correctly to the asynchronous generation queue.

---

## Project Structure

### Documentation (this feature)

```text
specs/011-tenant-onboarding/
├── plan.md              # This file
├── research.md          # Research and architectural decisions
├── data-model.md        # Database schema updates
├── quickstart.md        # Validation scenario walkthroughs
└── contracts/
    └── api.md           # API endpoint contracts
```

### Source Code (repository root)

```text
backend-nestjs/
└── src/
    ├── database/
    │   └── schema.service.ts        # Seed script modifications
    └── onboarding/
        ├── onboarding.module.ts
        ├── onboarding.controller.ts
        ├── onboarding.service.ts
        └── entities/
            └── onboarding-progress.entity.ts

frontend-vue/
└── src/
    ├── features/
    │   └── onboarding/
    │       ├── components/
    │       │   └── AppTour.vue
    │       └── store/
    │           └── onboarding.ts
    └── pages/
        └── index.vue                # Trigger tour
```

**Structure Decision**: Monorepo split between `backend-nestjs` and `frontend-vue`. Code matches existing multi-tenant architecture patterns.
