<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/007-solucionario-claves/plan.md

## Gestión de Materiales — Correcciones Implementadas (Jul 2026)

### Gaps críticos corregidos

1. **Hardcoded credentials** — Eliminados fallback UUIDs y `'uuid_admin_user'` en controller y service. Ahora
   `companyId` se obtiene de CLS y lanza `UnauthorizedException` si no existe. `x-subdomain: 'colegio'`
   reemplazado por `authStore.getSubdomain()` dinámico en `MaterialMatrixGenerator.vue`.

2. **`approveCuration` wrong ID** — Corregido `request.profileId` → `request.cycleId` en syllabus lookup y
   job payload del método `approveCuration` en `materials.service.ts`.

3. **`material_type` no persiste** — Agregada columna `materialType` a entidad `MaterialRequest` + set en
   `GenerateMaterialUseCase.execute()` según `dto.exam_areas` (EXAMEN/BALOTARIO).

4. **Código duplicado** — Eliminado `MaterialsService.generate()` (dead code, 275 líneas). La ruta
   `POST /v1/materials/generate` ahora solo usa `GenerateMaterialUseCase.execute()`.

5. **Tipos frontend desincronizados** — `types/materials.ts` actualizado: `MaterialRequestStatus` ahora
   incluye `IN_REVIEW`, `REVIEW_REQUIRED`, `COMPLETED_WITH_WARNINGS`; eliminado `CURATION_REQUIRED`.
   `ReviewQuestionStatus` reemplaza `CurationQuestionStatus` con valores `FOUND|EMPTY|REPLACED|REMOVED`.
   Interfaces `MaterialRequest`, `MaterialRequestCourse`, `MaterialReviewQuestion` sincronizadas con
   entidades del backend.

### Gaps medios corregidos

6. **Confirmación al descartar pregunta** — Agregado `UModal` en `MaterialReviewList.vue` para confirmar
   antes de descartar una pregunta.

7. **Loading state en review page** — Agregado skeleton loader en `review.vue` mientras se cargan los datos.

8. **WebSocket + Toast** — Creado `useMaterialWebSocket.ts` composable que conecta el WebSocket store y
   muestra toasts en eventos de completitud/falla/revisión. Integrado en `pages/materials/index.vue`.

### Archivos modificados
- `frontend-vue/src/types/materials.ts` — Tipos sincronizados
- `frontend-vue/src/features/materials/components/MaterialReviewList.vue` — UModal confirmación
- `frontend-vue/src/features/materials/components/MaterialMatrixGenerator.vue` — Subdomain dinámico
- `frontend-vue/src/features/materials/composables/useMaterialWebSocket.ts` — Nuevo
- `frontend-vue/src/pages/materials/[id]/review.vue` — Loading skeleton
- `frontend-vue/src/pages/materials/index.vue` — WS integration
- `backend-nestjs/src/materials/entities/material-request.entity.ts` — materialType columna
- `backend-nestjs/src/materials/entities/material-status.enum.ts` — Sin cambios (ya correcto)
- `backend-nestjs/src/materials/materials.controller.ts` — Hardcoded UUIDs → UnauthorizedException
- `backend-nestjs/src/materials/materials.service.ts` — Dead code eliminado, profileId→cycleId, hardcoded fallbacks
- `backend-nestjs/src/materials/use-cases/generate-material.use-case.ts` — materialType set
- `backend-nestjs/src/materials/material-design.controller.ts` — Hardcoded UUID → UnauthorizedException
- `backend-nestjs/src/materials/materials.service.spec.ts` — Tests actualizados
- `specs/004-generacion-revision-materiales/tasks.md` — T022-T028 marcados completados

### Tests
- Backend: 49 tests pasan (Jest)
- Frontend: 22 tests pasan (Vitest)
<!-- SPECKIT END -->
