# Tasks: Generación de Solucionario y Claves

**Input**: Design documents from `/specs/007-solucionario-claves/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Database schema updates and migrations

- [x] T001 Create database migration in `backend-nestjs/src/migrations/1718640000008-AddKeysAndSolutionsColumns.ts` to add `key_download_url` and `solution_download_url` to `material_request_courses`, and `merged_key_download_url` and `merged_solution_download_url` to `material_requests`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Entity properties and model synchronizations

- [x] T002 [P] Update Entity `MaterialRequest` in `backend-nestjs/src/materials/entities/material-request.entity.ts` to add `mergedKeyDownloadUrl` and `mergedSolutionDownloadUrl`.
- [x] T003 [P] Update Entity `MaterialRequestCourse` in `backend-nestjs/src/materials/entities/material-request-course.entity.ts` to add `keyDownloadUrl` and `solutionDownloadUrl`.
- [x] T004 Update `MaterialsService.updateMaterialStatus` in `backend-nestjs/src/materials/materials.service.ts` to support updating key and solution download URLs.

**Checkpoint**: Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - Motor de Generación y Compilación Asíncrona (Priority: P1) 🎯 MVP

**Goal**: Implement backend logic for compiling keys and step-by-step solutions into PDFs and uploading them to S3.

**Independent Test**: Trigger a generation job, verify that Playwright produces the Student PDF, Keys PDF, and Solutions PDF in background, and check that all URLs are correctly persisted.

### Implementation for User Story 1

- [x] T005 [P] [US1] Update `PdfGeneratorService.generatePdf` and `buildHtml` in `backend-nestjs/src/materials/services/pdf-generator.service.ts` to support `withKeysTable: boolean` and append the keys grid at the end of the course HTML.
- [x] T006 [US1] Modify `PdfGenerationProcessor.handleGeneratePdf` in `backend-nestjs/src/materials/processors/pdf-generation.processor.ts` to compile student, keys, and solutions PDFs for each course in the loop.
- [x] T007 [US1] Update `PdfGenerationProcessor.handleGeneratePdf` in `backend-nestjs/src/materials/processors/pdf-generation.processor.ts` to upload the generated keys and solutions PDFs to S3/GCS and save their URLs.
- [x] T008 [US1] Modify merge logic in `PdfGenerationProcessor.handleGeneratePdf` (after the loop) to merge keys and solutions PDFs into combined documents (`mergedKeyDownloadUrl` and `mergedSolutionDownloadUrl`).
- [x] T009 [US1] Update test suite `backend-nestjs/src/materials/materials.service.spec.ts` to cover the status update logic for keys and solutions.

**Checkpoint**: User Story 1 complete. The backend is fully capable of compiling all 3 PDF versions asíncronamente.

---

## Phase 4: User Story 2 - Visualización y Descarga Diferenciada en Frontend (Priority: P2)

**Goal**: Implement UI controls in the frontend to let users download Student, Keys, and Solutions PDFs independently.

**Independent Test**: Open the completed material details modal, check that the course list displays download buttons for student, keys, and solutions versions, and check that combined download links work.

### Implementation for User Story 2

- [x] T010 [P] [US2] Update interface `MaterialRequestCourse` and `MaterialRequest` in `frontend-vue/src/types/materials.ts` to add key/solution URL fields.
- [x] T011 [US2] Rediseñar la sección de listado de cursos en `frontend-vue/src/features/materials/components/MaterialMatrixGenerator.vue` to show Student, Keys, and Solutions download buttons.
- [x] T012 [US2] Update combined download section in `frontend-vue/src/features/materials/components/MaterialMatrixGenerator.vue` to add "Descargar PDF Combinado (Claves)" and "Descargar PDF Combinado (Solucionarios)".

**Checkpoint**: User Story 2 complete. The frontend allows downloading all versions.

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Styling, formatting, and edge cases verification

- [x] T013 Verify styles and visual alignment of the Keys grid and Solutions block in PDF output.
- [x] T014 Run Quickstart verification guide in `specs/007-solucionario-claves/quickstart.md` to ensure the entire system works end-to-end.
