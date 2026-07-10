# Walkthrough - Solucionarios y Claves de Respuestas

He completado con éxito la implementación de la funcionalidad para generar y descargar solucionarios (explicación paso a paso de cada pregunta) y la hoja de claves de respuestas para los materiales generados en la plataforma.

## Cambios Realizados

### 1. Base de Datos e Infraestructura
* **Migración TypeORM (`1718640000008-AddKeysAndSolutionsColumns.ts`):** Añadidos los campos `key_download_url` y `solution_download_url` en la tabla `material_request_courses`, y los campos `merged_key_download_url` and `merged_solution_download_url` en la tabla `material_requests`.
* **Mapeo de Entidades (`material-request.entity.ts`, `material-request-course.entity.ts`):** Vinculados los nuevos campos a las entidades de NestJS y sincronizados en los tipos TypeScript del frontend (`types/materials.ts`).

### 2. Motor de Generación Asíncrona (Backend)
* **Plantilla HTML (`pdf-generator.service.ts`):**
  * Se agregó el soporte para la grilla de claves de respuestas (`withKeysTable`) inyectada dinámicamente al final del documento con estilos CSS Grid adaptables e integrados en el diseño actual.
  * Se configuraron estilos de impresión (`column-span: all`, `page-break-inside: avoid`) para evitar que el cuadro de claves se rompa entre páginas.
* **Orquestación de Procesamiento (`pdf-generation.processor.ts`):**
  * Para cada curso, ahora se compilan tres PDFs independientes:
    1. **Estudiante:** Versión normal sin claves/solución.
    2. **Claves:** Versión que incluye la grilla de claves al final.
    3. **Solucionario:** Versión que muestra las explicaciones paso a paso bajo cada pregunta con la alternativa correcta marcada.
  * **Unión de PDFs:** Si la solicitud contiene múltiples cursos, se fusionan los tres tipos de PDFs de forma independiente para generar tres archivos consolidados (`mergedDownloadUrl`, `mergedKeyDownloadUrl` y `mergedSolutionDownloadUrl`).
* **Endpoints y Controladores (`materials.controller.ts`, `materials.service.ts`):**
  * Los endpoints de descarga ahora aceptan un parámetro `?type=student | keys | solutions` para servir el pre-signed URL del archivo S3/GCS correspondiente.

### 3. Visualización y Descarga (Frontend)
* **Rediseño del Componente (`MaterialMatrixGenerator.vue`):**
  * **Por Curso:** Se reemplazó el botón único de descarga por un grupo de tres botones compactos y estéticos:
    * 📥 **Estudiante** (Primary): Descarga el PDF estándar.
    * 🔑 **Claves** (Neutral/Soft): Descarga solo la hoja de respuestas del curso.
    * 🎓 **Solucionario** (Neutral/Soft): Descarga el PDF con las soluciones paso a paso del curso.
  * **Combinados (Completo):** En la parte inferior, si todos los cursos están completos, se habilitan las descargas consolidadas:
    * Un botón principal para descargar el PDF Combinado de Estudiante.
    * Dos botones en grilla secundaria para descargar el PDF Combinado de Claves y el PDF Combinado de Solucionario.

---

## Verificación

* **Compatibilidad de Tipos:** Se solucionaron posibles conflictos de tipos en los click-handlers de Vue sanitizando el evento de tipo `PointerEvent` para que no colisione con el parámetro de tipo de descarga.
* **Consistencia de Rutas:** Se preservó el uso dinámico del subdominio del tenant a través de `authStore.getSubdomain()` para garantizar seguridad en ambientes multi-inquilino.
