# Feature Specification: Generación y Revisión de Materiales PDF

**Feature Branch**: `004-generacion-revision-materiales`

**Created**: 2026-06-16

**Status**: Draft

## Context

Este módulo permite a los administradores generar documentos PDF en base a los **Perfiles de Material por Ciclo** (configurados previamente en el módulo de Tiempo Académico - Spec 002). El Perfil dicta las reglas (frecuencia, cursos y cantidades), y el motor lo cruza con el Sílabo para saber qué temas específicos evaluar. El flujo es asíncrono: el backend encola un trabajo en BullMQ (Redis), un Processor asíncrono en NestJS procesa la solicitud (extrae preguntas del Core API, ensambla el documento HTML y lo renderiza a PDF con Playwright, lo sube a S3) y notifica por WebSocket.

Opcionalmente, el administrador puede solicitar una **revisión del material** antes de la generación final del PDF, permitiéndole ver las preguntas seleccionadas en el orden del documento, gestionar vacíos y aprobar o ajustar el contenido.

**Out of Scope**:
- La edición del texto, alternativas o imágenes de las preguntas desde la interfaz del SaaS B2B. Las preguntas son inmutables en este flujo.
- La creación de nuevas preguntas desde este módulo (responsabilidad del Banco de Preguntas).

## Clarifications

### Session 2026-07-09

- Q: ¿Cómo se debe mostrar el historial de intentos en la interfaz para evitar la confusión de los saltos de números de versión de TypeORM? → A: Sin versiones numéricas (Opción C). Se elimina el texto "Versión X" de la UI y los intentos se identifican únicamente por su fecha, hora y estado.

### Session 2026-06-20

- Q: ¿Cómo se determina el rango de semanas acumulativas en la generación de material? → A: Sugerencia Inteligente + Edición Manual. Al solicitar la generación en la semana W con una acumulación N, el sistema pre-selecciona automáticamente las últimas N semanas activas (retrocediendo desde W), pero muestra un selector en la UI para que el usuario final pueda modificar la selección de semanas antes de confirmar.
- Q: ¿Cómo afectan las semanas inactivas (feriados/vacaciones) al cálculo de acumulación? → A: El cálculo de la ventana acumulativa salta automáticamente las semanas inactivas (`is_active = false`), considerando únicamente las semanas lectivas/activas del ciclo para la pre-selección inicial.
- Q: ¿Cómo se distribuyen las preguntas si las semanas acumuladas tienen pesos diferentes en el sílabo? → A: Distribución Equitativa (Round-Robin). El motor distribuye la cuota de preguntas del perfil de la manera más balanceada posible entre todos los temas/subtemas programados en las semanas seleccionadas, priorizando la equidad sobre los pesos individuales del sílabo.
- Q: ¿Las cantidades de preguntas del sílabo determinan el tamaño total del examen? → A: No. El sílabo solo define la distribución temática (los temas a evaluar). La cantidad total de preguntas del material se define exclusivamente en el Perfil de Material por Ciclo (ej. Examen = 10 preguntas), garantizando independencia total.

### Session 2026-06-21

- Q: ¿Se permite editar el contenido de las preguntas directamente en la pantalla de revisión de materiales, o solo se admite reemplazo/remoción? → A: Solo reemplazar/eliminar. El contenido de la pregunta es inmutable en el SaaS B2B, respetando la separación de dominios.
- Q: ¿Cómo se manejan la concurrencia y el estado "en proceso" durante la generación y revisión de material? → A: Ambos. Se introduce el estado `IN_REVIEW` cuando un admin entra a la pantalla de revisión, y `PROCESSING` queda reservado para la compilación activa del PDF por el Processor. Si otro administrador intenta abrir un material en `IN_REVIEW`, la UI mostrará una advertencia y el backend aplicará bloqueo optimista para prevenir sobreescrituras accidentales.
- Q: ¿Cuál es el tiempo de expiración de las URLs pre-firmadas y la retención de los PDFs en S3? → A: Las URLs pre-firmadas expiran en 24 horas y los archivos se retienen de forma permanente en S3 para el ciclo académico. Al solicitar la descarga, NestJS regenera la URL pre-firmada al instante sin volver a compilar el archivo.
- Q: ¿Cómo se gestionan los archivos y URLs cuando una solicitud incluye múltiples cursos? → A: Se almacenan de manera granular en una nueva tabla relacional `material_request_courses`, permitiendo tener un estado y un URL de descarga independiente para cada curso.
- Q: ¿Cómo debe comportarse el Processor si el Core API no responde (timeout) o retorna error? → A: Reintentos con Backoff y reporte final. El Processor reintenta la llamada hasta 3 veces con una pausa exponencial corta (2s, 4s, 8s). Si persiste, el Processor actualiza el estado de la solicitud y de sus cursos a `FAILED` en el SaaS, y notifica por WebSocket.
- Q: ¿Se debe implementar alguna regla básica de anti-repetición de preguntas dentro del alcance de la Spec 004, o queda diferida al 100% a la Spec 005? → A: 100% Diferida a la Spec 005. No se hace control de duplicados de preguntas entre distintos materiales o dentro del mismo documento en esta fase; las reglas se implementarán en la Spec 005 (Historial y trazabilidad).

### Session 2026-06-24

- Q: ¿Qué modelo de autorización rige quién puede solicitar generación, revisar materiales y acceder al historial? → A: Se difiere a una spec de permisos/roles separada; aquí solo se marca como dependencia.
- Q: ¿Cuál es el tiempo máximo aceptable para la generación completa de un PDF (end-to-end)? → A: ≤60 segundos desde que el admin solicita la generación hasta que recibe la notificación WebSocket.

### Session 2026-06-16

- Q: ¿Cómo sabe el Processor cuántas preguntas extraer si el sílabo ya no tiene cantidades estrictas? → A: A través de los Perfiles de Material por Ciclo. El admin primero crea un perfil (ej. "Examen Quincenal") que estipula el alcance (ej. últimas 2 semanas) y la cantidad por curso (ej. 20 Álgebra, 10 Física). Al generar, el backend cruza este perfil con el sílabo para enviar al Processor un payload exacto con temas y cantidades.
- Q: ¿De dónde viene el `syllabus_distribution` real? → A: De la tabla `syllabus_distribution` en el esquema del tenant, configurada previamente por el coordinador (Spec 003).
- Q: ¿Qué es "curaduría"? → A: Se renombra a "Revisión de Material". Es una vista donde el admin ve las preguntas en el orden que aparecerán en el PDF, gestiona las encontradas y los vacíos (preguntas insuficientes). No es un flujo separado — es una sección del módulo de materiales.
- Q: ¿Cómo se manejan preguntas insuficientes? → A: El admin puede continuar con inconsistencias (generando el PDF parcial) con advertencias visibles, o buscar reemplazos.
- Q: ¿Motor PDF? → A: Playwright (HTML/CSS → PDF headless Chrome). Excelente calidad de renderizado, soporte de fuentes modernas y branding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Solicitud de Generación de Material (Priority: P1)

Como administrador del tenant, quiero solicitar la generación de un PDF basándome en un perfil de material (previamente configurado en mi Ciclo) y una semana específicos, para obtener un documento con las preguntas exactas dictadas por las reglas del ciclo.

**Independent Test**: Solicitud de generación de un balotario para "Álgebra", semana 3. Verificación de HTTP 202 Accepted. Verificación de que el payload correcto se encoló en BullMQ con la distribución del sílabo.

**Acceptance Scenarios**:

1. **Given** un Ciclo con un Perfil de Material y sílabos configurados, **When** el admin solicita generar un material seleccionando la Semana y el Perfil, **Then** el backend cruza las reglas del perfil con el sílabo, arma el payload con los datos del tenant y la distribución final, y lo encola en BullMQ retornando HTTP 202 con el `job_id`.
2. **Given** una solicitud de material tipo EXAMEN, **When** el admin especifica las áreas de examen, **Then** el payload incluye el array de `exam_areas` para que el Processor genere cuadernillos segregados por área.
3. **Given** que el admin solicita generación con revisión, **When** marca la opción `requires_review = true`, **Then** el Processor pausa después de obtener las preguntas y notifica `REVIEW_REQUIRED` al frontend para que el admin revise antes de generar el PDF.

---

### User Story 2 - Procesamiento Asíncrono por el Processor (Priority: P1)

Como sistema, necesito que el Processor en AWS Fargate procese los mensajes de SQS, obtenga las preguntas del Core API según la distribución, genere el PDF con Playwright, lo suba a S3 y notifique al usuario.

**Independent Test**: Envío manual de un Job a BullMQ con distribución de 3 topics. Verificación de que el Processor procesó el mensaje, generó el PDF, lo subió a S3 con URL válida, y emitió notificación por WebSocket.

**Acceptance Scenarios**:

1. **Given** un Job en BullMQ con distribución del sílabo, **When** el Processor lo procesa, **Then** llama al Core API para obtener las preguntas de cada topic/subtopic según las cantidades solicitadas, genera el PDF usando Playwright con el branding del tenant (logo, nombre), sube el archivo a S3 y notifica vía WebSocket al usuario con el `download_url`.
2. **Given** un material tipo EXAMEN con múltiples áreas, **When** el Processor procesa el mensaje, **Then** genera un PDF separado por cada área, los empaqueta en un ZIP y sube el archivo único a S3.
3. **Given** que el Core API retorna menos preguntas de las solicitadas para algunos subtemas, **When** el Processor detecta la insuficiencia, **Then** registra el desglose de faltantes (ej. "Faltan 3 de Ecuaciones Lineales") y continúa con las preguntas disponibles, marcando los vacíos en el resultado.

---

### User Story 3 - Revisión de Material (Priority: P1)

Como administrador, quiero revisar las preguntas seleccionadas para un material antes de generar el PDF final, viendo el listado en el orden que aparecerán en el documento, pudiendo gestionar tanto las preguntas encontradas como los espacios vacíos donde no hubo preguntas suficientes.

**Independent Test**: Solicitud de material con `requires_review = true`. Verificación de que el frontend muestra la vista de revisión con las preguntas en orden. Reemplazo de una pregunta y verificación del cambio. Aprobación y verificación de que el PDF se genera con las preguntas finales.

**Acceptance Scenarios**:

1. **Given** un material con estado `REVIEW_REQUIRED`, **When** el admin accede a la vista de revisión, **Then** se muestra el listado de preguntas en el orden que aparecerán en el PDF, agrupadas por tema/subtema, con indicadores claros de preguntas encontradas vs. vacíos.
2. **Given** un vacío en la distribución (preguntas insuficientes), **When** el admin visualiza la revisión, **Then** el vacío se muestra con un indicador visual prominente y las opciones: (a) buscar pregunta de reemplazo del banco, (b) marcar como aceptable y continuar, o (c) eliminar el slot.
3. **Given** una revisión completa (con o sin inconsistencias), **When** el admin aprueba el material, **Then** el sistema dispara la generación del PDF final con las preguntas aprobadas y notifica por WebSocket cuando está listo.
4. **Given** una revisión con inconsistencias, **When** el admin elige "continuar con inconsistencias", **Then** el PDF se genera con las preguntas disponibles y una advertencia visible en el documento indicando los vacíos.

---

### User Story 4 - Notificación en Tiempo Real (Priority: P1)

Como administrador conectado al panel B2B, quiero recibir una notificación visual en tiempo real cuando mi material esté listo para descargar, sin necesidad de recargar la página.

**Independent Test**: Solicitud de generación de material. Verificación de que la notificación WebSocket llega al frontend y se muestra un toast/alerta con el link de descarga.

**Acceptance Scenarios**:

1. **Given** un material en procesamiento, **When** el Processor completa la generación y sube el PDF a S3, **Then** emite un evento WebSocket (`material.generation.completed`) que el frontend captura y muestra como notificación en la UI con el link de descarga.
2. **Given** un error durante el procesamiento, **When** el Processor falla, **Then** emite un evento WebSocket (`material.generation.failed`) con un mensaje de error descriptivo que el frontend muestra al usuario.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El backend MUST leer el Perfil de Material seleccionado (`cycle_material_profile`) y cruzarlo con el Sílabo. Por defecto, calculará el rango de las últimas N semanas activas del ciclo (excluyendo semanas inactivas `is_active = false`) para sugerir la pre-selección. Sin embargo, el sistema MUST permitir recibir un arreglo explícito de semanas desde el frontend para sobreescribir esta selección. El backend distribuirá la cuota de preguntas exigida por el perfil entre los temas y subtemas de las semanas seleccionadas de manera equitativa (Round-Robin).
- **FR-002**: El backend MUST persistir cada solicitud de material en la tabla `material_requests` con estado `PENDING` antes de enviar el Job a BullMQ.
- **FR-003**: El Processor MUST usar Playwright (HTML/CSS → PDF) como motor de generación de documentos, aplicando templates que incluyan el branding del tenant (logo, nombre comercial).
- **FR-004**: Cuando el Core API retorna menos preguntas de las solicitadas, el Processor MUST NO abortar — MUST continuar con las preguntas disponibles, registrar un desglose detallado de faltantes por tema/subtema, y marcar el material como `COMPLETED_WITH_WARNINGS`.
- **FR-005**: La vista de revisión MUST mostrar las preguntas en el orden exacto que aparecerán en el PDF, agrupadas por tema/subtema, con indicadores visuales claros para preguntas encontradas vs. vacíos.
- **FR-006**: El sistema MUST soportar dos modos de generación: (a) generación directa (sin revisión) y (b) generación con revisión previa (`requires_review = true`).
- **FR-007**: Las URLs de descarga de S3 para cada curso MUST ser URLs pre-firmadas (presigned URLs) con expiración temporal de 24 horas. El backend MUST generar una nueva URL pre-firmada al solicitar la descarga si la anterior ha expirado, sin necesidad de re-compilar el PDF.
- **FR-008**: Para materiales tipo EXAMEN con múltiples áreas, el Processor MUST generar cuadernillos separados por área y empaquetarlos en un ZIP.
- **FR-009**: Las preguntas presentadas en la vista de revisión MUST ser inmutables. El sistema MUST permitir únicamente el reemplazo lógico (`REPLACED`) o la eliminación de la pregunta en la distribución (`REMOVED`), sin modificar el contenido original de la pregunta.
- **FR-010**: El sistema MUST manejar la siguiente máquina de estados para `material_requests.status`:
  - `PENDING` -> `REVIEW_REQUIRED` (si requiere revisión, tras la extracción inicial por el Processor).
  - `REVIEW_REQUIRED` -> `IN_REVIEW` (cuando un administrador abre la pantalla de revisión).
  - `IN_REVIEW` o `PENDING` -> `PROCESSING` (cuando se aprueba la revisión o se inicia generación directa, mientras el Processor compila el PDF).
  - `PROCESSING` -> `COMPLETED` / `COMPLETED_WITH_WARNINGS` / `FAILED` (según el resultado de la generación del PDF).
- **FR-011**: Cuando un material esté en estado `IN_REVIEW`, el backend MUST aplicar control de concurrencia optimista. Si otro administrador intenta guardar modificaciones o aprobar el material, el sistema MUST rechazar la acción con una alerta visual indicando que el material ya está siendo modificado o ha cambiado de estado.
- **FR-012**: El sistema MUST registrar y procesar los archivos generados de forma independiente por curso. Cada curso en la solicitud tendrá su propia entrada en `material_request_courses` con su estado, URL de descarga y posibles advertencias.

### Structural Constraints (Critical)

- **CR-001**: La generación de PDF NUNCA debe ocurrir de forma síncrona dentro del backend NestJS. Todo procesamiento intensivo MUST ser despachado al Processor vía SQS.
- **CR-002**: El Processor es un servicio aislado que NO tiene acceso directo a la base de datos del SaaS B2B. Toda la información necesaria viaja en el payload de SQS.
- **CR-003**: Las notificaciones WebSocket se gestionan a través de AWS API Gateway WebSockets, no mediante conexiones directas Socket.io.

### Key Entities

- **material_requests**: Solicitud de material. Campos: `id` (uuid), `tenant_id` (string), `profile_id` (FK → cycle_material_profiles), `week_number` (number), `status` (enum: PENDING, IN_REVIEW, PROCESSING, REVIEW_REQUIRED, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED), `requires_review` (boolean), `created_by` (FK), `created_at` (timestamp).
- **material_request_courses**: Archivos y URLs por curso de la solicitud de material. Campos: `id` (uuid), `material_request_id` (FK → material_requests), `course_id` (string), `status` (enum: PENDING, PROCESSING, COMPLETED, COMPLETED_WITH_WARNINGS, FAILED), `download_url` (string, nullable), `warnings` (jsonb, nullable), `created_at` (timestamp).
- **material_review_questions**: Preguntas de revisión. Campos: `id` (uuid), `material_request_id` (FK), `question_id` (string), `topic_id` (FK), `subtopic_id` (FK), `position` (number), `status` (enum: FOUND, EMPTY, REPLACED, REMOVED).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un material puede ser solicitado, procesado asincrónicamente, y descargado desde S3 exitosamente end-to-end.
- **SC-002**: La vista de revisión muestra las preguntas en el orden correcto y permite gestionar vacíos sin pérdida de datos.
- **SC-003**: Las notificaciones WebSocket llegan al frontend en tiempo real (< 2 segundos después de que el Processor completa).
- **SC-004**: Materiales tipo EXAMEN con N áreas generan exactamente N cuadernillos empaquetados en un ZIP.
- **SC-005**: El tiempo end-to-end de generación de un PDF (desde solicitud hasta notificación WebSocket) MUST ser ≤60 segundos en condiciones normales de operación.

## Edge Cases

- **EC-001**: Si Redis/BullMQ está temporalmente inaccesible al momento de enviar el mensaje, el backend MUST reintentar con backoff exponencial (hasta 3 intentos) antes de fallar con HTTP 503.
- **EC-002**: Si el Core API retorna 0 preguntas para toda la distribución (banco completamente vacío para ese curso), el Processor MUST marcar el material como FAILED con mensaje descriptivo, sin generar un PDF vacío.
- **EC-003**: Si un material está en estado `REVIEW_REQUIRED` por más de 24 horas sin acción del admin, el sistema MUST NO auto-expirar — permanece en revisión hasta acción explícita.
- **EC-004**: Si el admin solicita un material para una semana que no tiene distribución en el sílabo, el backend MUST rechazar con HTTP 400 y mensaje: "No hay distribución configurada para la semana seleccionada".
- **EC-005**: Si el Core API retorna un error de red o de servidor (HTTP 5xx / Timeout) durante la consulta de reactivos, el Processor MUST realizar hasta 3 intentos con backoff exponencial (2, 4, 8 segundos). Si todos los intentos fallan, el Processor MUST actualizar el estado de la solicitud y de sus cursos asociados a `FAILED`, abortando la generación y notificando al frontend por WebSocket.

## Assumptions

- Se asume que el Core API (Banco de Preguntas) expone endpoints REST para obtener preguntas filtradas por course_id, topic_id, subtopic_id y dificultad.
- Se asume que la infraestructura corre Node.js con Chromium (Playwright) y acceso a Redis para BullMQ.
- Se asume que las preguntas del Core API incluyen contenido completo (texto, imágenes, alternativas) necesario para renderizar el PDF.
- Se asume que el Historial y las reglas anti-repetición de preguntas se definirán en la Spec 005.
- Se asume que el modelo de autorización (qué roles pueden solicitar generación, revisar y descargar materiales) se definirá en una spec de permisos/roles separada. Este módulo opera bajo la premisa de que el usuario autenticado tiene los permisos necesarios.
