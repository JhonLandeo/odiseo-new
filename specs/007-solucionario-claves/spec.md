# Feature Specification: Generación de Solucionario y Claves

**Feature Branch**: `007-solucionario-claves`

**Created**: 2026-07-10

**Status**: Ready for Planning

**Input**: User description: "Implementar la generación y visualización del solucionario (explicación paso a paso de cada pregunta) y la hoja de claves de respuestas para los materiales generados. Las claves son independientes por curso y se muestran en una tabla al final de cada curso. El solucionario muestra cada pregunta con la alternativa correcta marcada y la explicación detallada."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visualización e Interfaz de Descargas en Plataforma (Priority: P1)

Como docente o administrador de un colegio cliente del SaaS B2B, quiero ver una interfaz bien estructurada en el detalle del material que me permita seleccionar qué versión del PDF generar y descargar para cada curso.

**Why this priority**: Permite al usuario interactuar de forma intuitiva con las tres versiones del material: Alumno (sin claves), Claves (con tabla al final) y Solucionario (con desarrollo detallado).

**Independent Test**: Abrir la lista de cursos en el visor de materiales (`MaterialMatrixGenerator.vue`), ver que el botón de descarga del curso ahora ofrece tres opciones diferenciadas y poder solicitar la generación de cada una de ellas de forma independiente.

**Acceptance Scenarios**:

1. **Given** que un material ha sido generado con éxito, **When** el docente despliega las opciones de descarga de un curso, **Then** visualiza tres acciones claras:
   - "Descargar Material (Estudiante)"
   - "Descargar Claves de Respuestas"
   - "Descargar Solucionario Detallado"
2. **Given** que el docente selecciona "Descargar Claves de Respuestas", **When** el sistema procesa el PDF, **Then** se genera un documento que incluye el examen/balotario y, únicamente al final del curso, muestra un cuadro estructurado con la relación ordenada de preguntas y sus alternativas correctas.
3. **Given** que el docente selecciona "Descargar Solucionario Detallado", **When** el sistema procesa el PDF, **Then** se genera un documento donde cada pregunta tiene su alternativa correcta marcada visualmente y muestra el bloque de resolución detallada inmediatamente debajo de las alternativas.

---

### User Story 2 - Generación e Impresión Asíncrona de las 3 Versiones del PDF (Priority: P2)

Como docente, quiero que la generación del PDF de Claves y del PDF de Solucionario ocurra de forma asíncrona en segundo plano sin interrumpir mi trabajo en la plataforma.

**Why this priority**: La Constitución del proyecto prohíbe compilar PDFs síncronamente en el servidor API. El renderizado del solucionario, que contiene explicaciones detalladas y fórmulas matemáticas, consume mucha CPU y debe procesarse en background.

**Independent Test**: Hacer clic en "Descargar Solucionario Detallado" para un curso, continuar editando otros materiales, recibir la notificación Toast de finalización y realizar la descarga directa desde el enlace generado.

**Acceptance Scenarios**:

1. **Given** que el usuario solicita la versión de Claves o Solucionario, **When** el backend NestJS recibe la solicitud, **Then** registra la petición en la BD, delega la tarea al procesador de background y retorna un estado inmediato de procesamiento.
2. **Given** que el procesador asíncrono finaliza de compilar el PDF de solucionario, **When** se sube el archivo a almacenamiento (GCS/S3), **Then** actualiza el campo de descarga correspondiente en la base de datos y notifica al cliente mediante WebSockets.

---

### Edge Cases

- **Ausencia de datos de solucionario en flat_questions**: Si una pregunta de la tabla `flat_questions` no tiene explicación registrada (campo `solution` vacío o nulo), el PDF del solucionario detallado debe omitir la caja de resolución para esa pregunta y renderizar únicamente la pregunta con la alternativa correcta marcada, sin interrumpir el proceso de compilación del PDF ni lanzar un error crítico.
- **Visualización por defecto sin claves**: El PDF de Estudiante (generado por defecto al inicio) no debe incluir en ninguna parte las claves ni explicaciones, garantizando que el material esté limpio para ser resuelto por los alumnos.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST generar por defecto el PDF para Estudiantes sin mostrar claves ni explicaciones.
- **FR-002**: El sistema MUST permitir la generación de una versión de "Claves de Respuestas", la cual incluye una tabla o cuadro de respuestas correctas al final de cada curso.
- **FR-003**: El sistema MUST permitir la generación de una versión de "Solucionario Detallado", donde cada pregunta del material se renderiza con su respectiva alternativa correcta marcada visualmente, mostrando su explicación paso a paso (proveniente del campo `solution` de `flat_questions`) inmediatamente después.
- **FR-004**: Los solucionarios se obtendrán localmente desde la tabla plana de preguntas `odiseo.flat_questions` (la cual ya posee los datos de didiMaths y diagramado de soluciones), evitando llamadas REST adicionales al Core API.
- **FR-005**: La compilación de todas las versiones del PDF MUST realizarse asíncronamente en segundo plano.
- **FR-006**: Se MUST ampliar el esquema de la base de datos para almacenar tres URLs de descarga independientes por cada curso asociado al material:
  - `download_url` (Versión Estudiante)
  - `key_download_url` (Versión Claves de Respuestas)
  - `solution_download_url` (Versión Solucionario Detallado)
- **FR-007**: La interfaz UI de descarga de cursos en el visor de matriz (`MaterialMatrixGenerator.vue`) MUST estructurarse para ofrecer la descarga diferenciada de estas tres opciones cuando el estado del curso sea completo.

### Key Entities *(include if feature involves data)*

- **MaterialRequestCourse**: Ampliada con las columnas:
  - `key_download_url` (string, nullable)
  - `solution_download_url` (string, nullable)
  - `key_status` (enum CourseMaterialStatus, default PENDING)
  - `solution_status` (enum CourseMaterialStatus, default PENDING)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El tiempo de respuesta inicial de la API al solicitar la descarga de un solucionario o claves debe ser inferior a 300ms, delegando inmediatamente el procesamiento al worker.
- **SC-002**: Al final de cada curso en el PDF de Claves, se debe renderizar una cuadrícula (tabla) compacta con el 100% de las respuestas del curso indexadas por número de pregunta.
- **SC-003**: El frontend debe recibir el payload del WebSocket y habilitar los botones de descarga específicos (Claves/Solucionario) en menos de 500ms tras la finalización del trabajo asíncrono.

## Assumptions

- La tabla `flat_questions` ya contiene toda la información de soluciones (`diagrammed`, `diagrammed_images`, `didi_maths`) y el indicador de alternativa correcta (`is_correct` / `isCorrect`) para las preguntas utilizadas en los materiales.
- Se reutilizará la infraestructura de generación de PDF mediante Playwright en `PdfGeneratorService` que ya soporta el parámetro `withSolution`.
- Se adaptará el motor de PDF para soportar la generación de la hoja de claves al final de cada curso cuando se solicite dicha versión.
