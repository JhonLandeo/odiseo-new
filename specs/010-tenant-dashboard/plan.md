# Implementation Plan: B2B Tenant Dashboard with Cycle Breakdown

**Branch**: `[010-tenant-dashboard]` | **Date**: 2026-07-12 | **Spec**: [spec.md](file:///home/jhon/Documents/work-projects/odiseo-new/specs/010-tenant-dashboard/spec.md)

## Summary

Implement a high-fidelity B2B School Dashboard for client tenants. It consolidates global SaaS consumption (PDFs generated, questions consumed, manual curation replacements) at the tenant level, comparison tables showing metrics broken down by academic cycle, and recent activity history containing cycle identifiers and status badges.

## Technical Context

**Language/Version**: TypeScript (Node.js 20+)

**Primary Dependencies**: NestJS, Nuxt 3 (Vue 3, TailwindCSS, Pinia)

**Storage**: PostgreSQL (multi-tenant schema layout)

**Target Platform**: SaaS Web Application

**Performance Goals**: Sub-500ms response time on aggregated queries.

## Constitution Check

- [x] **Separation of Domains**: Valid. Implementation scopes only the school dashboard module.
- [x] **Clean Architecture**: Valid. Queries decoupled via NestJS services.
- [x] **Quality Standards**: Valid. Use standard clean styles matching the existing Nuxt layouts.

## Project Structure

### Documentation (this feature)

```text
specs/010-tenant-dashboard/
├── spec.md              # Feature specification
├── plan.md              # This file
├── data-model.md        # Data model analysis
└── tasks.md             # Task checklist (completed)
```

### Source Code

```text
backend-nestjs/
└── src/
    └── materials/
        ├── materials.controller.ts  # Add Get('dashboard/metrics')
        └── materials.service.ts     # Add getTenantDashboardMetrics() method

frontend-vue/
└── src/
    ├── features/
    │   └── materials/
    │       └── store/
    │           └── materials.ts     # Add fetchDashboardMetrics() Pinia action
    └── pages/
        └── index.vue                # Main dashboard page layout
```
