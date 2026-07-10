# Implementation Plan: Solucionario y Claves por Curso

**Branch**: `007-solucionario-claves` | **Date**: 2026-07-10 | **Spec**: [spec.md](file:///home/jhon/other-projects/odiseo-new/specs/007-solucionario-claves/spec.md)

---

## Resumen Técnico

Esta funcionalidad permite a los docentes visualizar y descargar la hoja de claves (grilla de respuestas correctas al final del documento) y el solucionario detallado (con explicación paso a paso y la alternativa correcta marcada visualmente) para cada curso dentro de los materiales (exámenes y balotarios). 

Para cumplir con la **Odiseo Constitution**, la compilación de todos los PDFs se mantendrá 100% asíncrona. Durante el procesamiento del material en segundo plano, el worker generará en paralelo las tres versiones del PDF (Estudiante, Claves y Solucionario) para cada curso, las subirá a S3/GCS y guardará sus respectivas URLs en la base de datos. La interfaz en Nuxt UI se estructurará con botones de descarga específicos por versión.

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Separación de Dominios (✓ Pasa):** La data de explicaciones y alternativas se obtiene directamente de `odiseo.flat_questions` (fuente inmutable local) usando `question_id`.
- **Asincronía Extrema (✓ Pasa):** Las tres versiones del PDF se generan en el worker asíncrono (procesador de la cola `materials-queue`), evitando compilar síncronamente en el hilo de la API NestJS.
- **Nombres en Inglés en Base de Datos (✓ Pasa):** Las columnas añadidas se nombran en inglés y snake_case (`key_download_url`, `solution_download_url`, etc.).
- **UX & Notificaciones (✓ Pasa):** El estado de completitud o fallas de las nuevas compilaciones se integra con los eventos WebSocket existentes y notificaciones Toast no bloqueantes.

---

## Cambios Propuestos

### 1. Base de Datos (PostgreSQL)

#### [MODIFY] Esquemas Multi-tenant (`tenant_*`)
Añadir soporte para guardar las URLs independientes de Claves y Solucionarios en las tablas correspondientes de cada tenant. Esto se incluirá en el script de inicialización de esquemas y se aplicará mediante una migración de TypeORM:
- Tabla `tenant_*.material_request_courses`:
  - `key_download_url` VARCHAR(2048) NULL
  - `solution_download_url` VARCHAR(2048) NULL
- Tabla `tenant_*.material_requests`:
  - `merged_key_download_url` VARCHAR(2048) NULL
  - `merged_solution_download_url` VARCHAR(2048) NULL

---

### 2. Backend (NestJS)

#### [MODIFY] [material-request-course.entity.ts](file:///home/jhon/other-projects/odiseo-new/backend-nestjs/src/materials/entities/material-request-course.entity.ts)
- Agregar campos `keyDownloadUrl` y `solutionDownloadUrl` decorados con `@Column({ name: 'key_download_url', nullable: true })`.

#### [MODIFY] [material-request.entity.ts](file:///home/jhon/other-projects/odiseo-new/backend-nestjs/src/materials/entities/material-request.entity.ts)
- Agregar campos `mergedKeyDownloadUrl` and `mergedSolutionDownloadUrl`.

#### [MODIFY] [pdf-generator.service.ts](file:///home/jhon/other-projects/odiseo-new/backend-nestjs/src/materials/services/pdf-generator.service.ts)
- Modificar `generatePdf(...)` y `buildHtml(...)` para recibir el parámetro `withKeysTable?: boolean`.
- En `buildHtml`, si `withKeysTable` es `true`, mapear las preguntas de la lista obteniendo la letra correcta de cada pregunta (ej: `options.find(o => o.isCorrect).label`). Renderizar una sección CSS Grid al final del HTML que muestre estas respuestas en forma de cuadro estructurado (ej: "1-A, 2-C, 3-B").
- Asegurar que la renderización de la alternativa correcta (clase `alternative__bg--correct` y bordes) y la caja de soluciones (`solution__box`) se ejecute si `withSolution` es `true`.

#### [MODIFY] [pdf-generation.processor.ts](file:///home/jhon/other-projects/odiseo-new/backend-nestjs/src/materials/processors/pdf-generation.processor.ts)
- Modificar el flujo de `handleGeneratePdf(data)` para que, por cada curso de la distribución:
  1. Genere el PDF de Estudiante (`pdfBuffer`).
  2. Genere el PDF de Claves (`keysPdfBuffer`) llamando a `generatePdf` con `withKeysTable = true` y `withSolution = false`.
  3. Genere el PDF de Solucionario (`solutionPdfBuffer`) llamando a `generatePdf` con `withKeysTable = false` and `withSolution = true`.
  4. Suba los tres buffers a S3/GCS y registre sus respectivas URLs.
- Modificar la actualización de estado para guardar tanto `download_url` como `key_download_url` y `solution_download_url`.
- Modificar el generador de PDF Combinado (`handleMergePdf` / flujo de merge) para generar también los PDFs combinados completos para Claves y Solucionarios si el material posee múltiples cursos.

#### [MODIFY] [materials.service.ts](file:///home/jhon/other-projects/odiseo-new/backend-nestjs/src/materials/materials.service.ts)
- Actualizar el método `updateMaterialStatus` para aceptar y actualizar en base de datos las nuevas URLs de claves y solucionarios de cada curso y del request combinado.

---

### 3. Frontend (Vue/Nuxt)

#### [MODIFY] [types/materials.ts](file:///home/jhon/other-projects/odiseo-new/frontend-vue/src/types/materials.ts)
- Agregar propiedades `keyDownloadUrl` y `solutionDownloadUrl` a la interfaz `MaterialRequestCourse`.
- Agregar `mergedKeyDownloadUrl` y `mergedSolutionDownloadUrl` a la interfaz `MaterialRequest`.

#### [MODIFY] [MaterialMatrixGenerator.vue](file:///home/jhon/other-projects/odiseo-new/frontend-vue/src/features/materials/components/MaterialMatrixGenerator.vue)
- En el panel lateral "Ver Cursos & PDFs", rediseñar el listado de cada curso para reemplazar el botón único de descarga por una fila de botones de acción o un dropdown claro:
  - Botón Estudiante: Icono `i-heroicons-arrow-down-tray` (Descargar material limpio).
  - Botón Claves: Icono `i-heroicons-key` (Descargar claves).
  - Botón Solucionario: Icono `i-heroicons-academic-cap` (Descargar solucionario paso a paso).
- Deshabilitar o no mostrar los botones de claves/solucionario si sus respectivas URLs aún no están disponibles o cargadas.
- En la parte inferior, si todos los cursos están completos, mostrar tres botones de descarga combinada:
  - "Descargar PDF Combinado (Estudiante)"
  - "Descargar PDF Combinado (Claves)"
  - "Descargar PDF Combinado (Solucionarios)"

---

## Plan de Verificación

### Pruebas Automatizadas
Se crearán o modificarán pruebas unitarias para garantizar el comportamiento:
- En backend:
  - `pnpm run test backend-nestjs/src/materials/materials.service.spec.ts`
  - Añadir pruebas de generación de PDF en `pdf-generator.service.spec.ts` inyectando preguntas con y sin solución.
- En frontend:
  - `pnpm run test:unit` para validar que `MaterialMatrixGenerator.vue` renderiza correctamente las tres acciones de descarga cuando las URLs están presentes.

### Verificación Manual
1. Generar un material con múltiples cursos utilizando la matriz en el frontend.
2. Comprobar que en la base de datos se generan las tres URLs de descarga independientes para cada curso.
3. Descargar las tres variantes (Estudiante, Claves y Solucionario) desde la UI del visor.
4. Validar visualmente el PDF de Claves: debe tener la cuadrícula de respuestas correctas estrictamente al final.
5. Validar visualmente el PDF de Solucionario: cada pregunta debe mostrar su respectiva explicación y la alternativa correcta coloreada/marcada.
