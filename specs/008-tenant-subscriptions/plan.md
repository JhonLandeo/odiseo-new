# Implementation Plan: Gestión de Tenants y Suscripciones

**Branch**: `[008-tenant-subscriptions]` | **Date**: 2026-07-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-tenant-subscriptions/spec.md`

## Summary

Implementar la gestión centralizada de empresas (tenants), motor de planes de suscripción y dashboard de consumo e infraestructura. La solución utilizará una arquitectura multitenant "Schema-per-tenant" aislada a nivel de base de datos, garantizando la continuidad operativa mediante bloqueos diferidos e incorporando métricas asíncronas precisas sobre el consumo de recursos de generación y almacenamiento.

## Technical Context

**Language/Version**: TypeScript (Node.js 20+), Vue 3
**Primary Dependencies**: NestJS, TypeORM, Vue.js, Tailwind CSS
**Storage**: PostgreSQL (con patrón Schema-per-tenant)
**Testing**: Jest (Backend), Vitest (Frontend)
**Target Platform**: Aplicación Web (SaaS B2B)
**Project Type**: Full-stack web application (Backend REST API + SPA)
**Performance Goals**: Consultas de dashboard optimizadas, aprovisionamiento de tenant < 2 min.
**Constraints**: Asincronía extrema en reportes. Aislamiento estricto de la base de datos por tenant. Nomenclatura SQL estrictamente en snake_case e inglés.
**Scale/Scope**: Diseño escalable para múltiples instituciones, control global en esquema público.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Separación de Dominios**: El B2B no almacena preguntas pesadas, solo referencias y lógica de negocio escolar.
- [x] **Convención de Nombres**: Toda nueva tabla (`tenant`, `subscription_plan`) usará snake_case y términos en inglés.
- [x] **Aislamiento Físico y Schema-per-tenant**: Cumplido nativamente; se creará un esquema dedicado al dar de alta cada tenant.
- [x] **Antipatrones Evitados**: No se utiliza Row-level Tenancy para la data principal, y la facturación/monitoreo no será un proceso bloqueante.

## Project Structure

### Documentation (this feature)

```text
specs/008-tenant-subscriptions/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (futuro)
```

### Source Code (repository root)

```text
backend-nestjs/
├── src/
│   ├── admin/
│   │   ├── tenants/          # Gestión de ciclo de vida del tenant
│   │   ├── subscriptions/    # Gestión de planes comerciales
│   │   └── dashboard/        # Métricas de consumo
│   └── common/
│       └── database/         # Utilidades de schema-per-tenant

frontend-vue/
├── src/
│   ├── views/admin/
│   │   ├── TenantsView.vue
│   │   ├── SubscriptionsView.vue
│   │   └── DashboardView.vue
│   └── stores/               # Pinia stores para administración
```

**Structure Decision**: Se creará un módulo aislado `admin` en el backend-nestjs para agrupar todas las funcionalidades exclusivas del rol Super Administrador, manteniendo la separación de la lógica core que usan los usuarios estándar.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Ninguna | N/A | N/A |
