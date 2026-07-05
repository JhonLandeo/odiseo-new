---
description: "Task list for Generación y Revisión de Materiales PDF"
---

# Tasks: Generación y Revisión de Materiales PDF (Specs 004 y 005)

**Input**: Design documents from `/specs/004-generacion-revision-materiales/` y `/specs/005-historial-trazabilidad/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests integrados bajo TDD no solicitados explícitamente, pero enfocados a End-to-End validable según quickstart.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure para el Worker FastAPI.

- [x] T001 [OBSOLETO] Proyecto Python descartado, se usará Playwright en NestJS
- [x] T002 [OBSOLETO] Configuración migrada al app.module de NestJS
- [x] T003 [P] Configurar script de localstack para S3 (SQS descartado por Redis/BullMQ)
- [x] T004 [P] Generar módulo base NestJS: `nest g module materials` en `backend-nestjs/src/materials`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T005 Crear entidad `MaterialRequest` en `backend-nestjs/src/materials/entities/material-request.entity.ts`
- [x] T006 [P] Crear entidad `MaterialRequestCourse` en `backend-nestjs/src/materials/entities/material-request-course.entity.ts`
- [x] T007 [P] Crear entidad `MaterialReviewQuestion` en `backend-nestjs/src/materials/entities/material-review-question.entity.ts`
- [x] T008 [P] Crear entidad `MaterialQuestionUsage` en `backend-nestjs/src/materials/entities/material-question-usage.entity.ts` con índices compuestos (Spec 005)
- [x] T009 Crear repositorio abstracto e implementación `IMaterialsRepository` y `MaterialsRepository`
- [x] T010 [P] Configurar BullModule y registerQueue('materials-pdf') en `materials.module.ts`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Solicitud de Generación de Material (Priority: P1) 🎯 MVP

**Goal**: Permitir al administrador solicitar un material validando syllabus, perfil y reglas anti-repetición (strict).

**Independent Test**: Enviar POST a `/api/v1/materials/generate` y verificar mensaje en SQS.

### Implementation for User Story 1

- [x] T011 [P] [US1] Crear `GenerateMaterialDto` en `backend-nestjs/src/materials/dto/generate-material.dto.ts`
- [x] T012 [US1] Implementar lógica de validación de Syllabus y Perfil en `backend-nestjs/src/materials/use-cases/generate-material.use-case.ts`
- [x] T013 [US1] Integrar query de anti-repetición estricta (excluyendo por `cycle_id`) en el caso de uso
- [x] T014 [US1] Implementar endpoint `POST /api/v1/materials/generate` en `backend-nestjs/src/materials/materials.controller.ts`
- [x] T015 [P] [US1] Crear modal UI `MaterialGenerateModal.vue` en `frontend-vue/src/features/materials/components/`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently (BullMQ encola el Job).

---

## Phase 4: User Story 2 - Procesamiento Asíncrono en Background (Priority: P1)

**Goal**: Processor de BullMQ procesa el Job, consulta Core API, renderiza a PDF con Playwright, lo sube a S3 y notifica.

**Independent Test**: Inyectar Job manual en BullMQ y verificar que sube PDF a S3 y emite WebSocket.

### Implementation for User Story 2

- [x] T016 [US2] Implementar PdfGenerationProcessor (@Processor) en `backend-nestjs/src/materials/processors/pdf-generation.processor.ts`
- [x] T017 [P] [US2] Implementar servicio Http para consultar Core API en `backend-nestjs/src/materials/services/core-api.service.ts`
- [x] T018 [P] [US2] Implementar compilación con Playwright en `backend-nestjs/src/materials/services/pdf-generator.service.ts`
- [x] T019 [P] [US2] Implementar subida a S3 en `backend-nestjs/src/materials/services/s3.service.ts`
- [x] T020 [US2] Integrar flujo completo en el Processor y emitir evento WS usando ApiGatewayManagementApi
- [x] T021 [US2] Implementar manejo de "vacíos" (0 preguntas retornadas) registrando advertencias y estado `COMPLETED_WITH_WARNINGS`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently. PDFs se generan.

---

## Phase 5: User Story 3 - Revisión de Material (Priority: P1)

**Goal**: Administrador puede revisar preguntas en orden, ver vacíos (debidos a pool agotado) y aprobar la generación.

**Independent Test**: Solicitar material con `requires_review = true` y aprobar en la vista.

### Implementation for User Story 3

- [x] T022 [US3] Crear endpoint `GET /api/v1/materials/:id/review` en controller de NestJS
- [x] T023 [P] [US3] Crear endpoints `PUT /approve` y `PUT /replace` en controller con bloqueo optimista
- [x] T024 [P] [US3] Crear `MaterialReviewList.vue` en `frontend-vue/src/features/materials/components/`
- [x] T025 [P] [US3] Implementar página `review.vue` en `frontend-vue/src/pages/materials/[id]/`
- [x] T026 [US3] Integrar Processor para pausar generación en `REVIEW_REQUIRED` (Spec 004)

**Checkpoint**: Flujo de revisión operativa.

---

## Phase 6: User Story 4 - Notificación en Tiempo Real (Priority: P1)

**Goal**: Mostrar notificación Toast con enlace de descarga al completarse el Worker.

**Independent Test**: Verificar recepción de mensaje WS en UI.

### Implementation for User Story 4

- [x] T027 [US4] Implementar composable `useMaterialWebSocket.ts` en `frontend-vue/src/features/materials/composables/`
- [x] T028 [US4] Escuchar eventos y mostrar `Toast` nativo en layout principal

---

## Phase 7: User Story 5 - Historial y Trazabilidad (Spec 005 - P1/P2)

**Goal**: Registrar historial de uso de preguntas, listar materiales y regenerar URLs pre-firmadas.

**Independent Test**: Consultar historial y ver preguntas registradas en `material_question_usage`.

### Implementation for User Story 5

- [ ] T029 [US5] (PENDING EVALUATION) Crear webhook en NestJS para recibir confirmación de completitud del Processor e insertar registros en `material_question_usage`
- [ ] T030 [US5] (CANCELLED) Implementar endpoint `GET /api/v1/materials` con filtros para historial
- [ ] T031 [P] [US5] Implementar endpoint `GET /api/v1/materials/:courseId/download` para regenerar URL S3
- [ ] T032 [US5] (CANCELLED) Crear vista `history.vue` en `frontend-vue/src/pages/materials/`
- [ ] T033 [P] [US5] Integrar despliegue de advertencias (Warnings) en la UI del historial

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T034 [P] Ejecutar y validar `quickstart.md` localmente con LocalStack
- [ ] T035 Revisión de logs y mensajes de error en NestJS y BullMQ para asegurar SLA <= 60s
- [ ] T036 Code cleanup and refactoring

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - Phase 3, 4, y 5 tienen fuerte acoplamiento conceptual pero pueden desarrollarse en paralelo con contratos claros.
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### Parallel Opportunities

- Creación de UI (Vue) y Backend (NestJS/FastAPI) pueden ocurrir simultáneamente.
- Processor BullMQ (US2) puede aislarse enviando Jobs manuales a Redis.
