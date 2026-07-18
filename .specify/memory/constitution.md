<!--
Sync Impact Report
- Version change: 1.0.1 → 2.0.0
- Rationale: Reestructuración MAYOR. Se separan los PRINCIPIOS (invariantes,
  agnósticos de tecnología) de la IMPLEMENTACIÓN VIGENTE (stack concreto,
  enmendable). Se relajan mandatos tecnológicos prematuros (FastAPI, Fargate,
  SQS, API Gateway WebSockets, pgvector) que no reflejaban el código real,
  y se refuerzan los invariantes que sí protegen al negocio.
- Modified principles:
  - II. Valores Principales → reformulado como "Invariantes Arquitectónicos"
    (no negociables), con foco en el PRINCIPIO (cómputo pesado fuera del proceso
    de la API) en vez de la tecnología (Fargate).
  - III. Tech Stack → renombrado "Implementación Vigente" y marcado como
    ENMENDABLE vía PATCH/MINOR sin revisión constitucional mayor.
  - V. Restricciones de Integración → el acceso al banco pasa de "SOLO REST"
    a "solo lectura y detrás de una capa anticorrupción".
  - VIII. Antipatrones → reformulados alrededor del principio (no del stack).
- Added:
  - Estándar de idempotencia para jobs asíncronos.
  - Distinción explícita Invariante vs Implementación en Governance.
- Removed: mandatos duros de FastAPI, Fargate, SQS, API Gateway WebSockets y
  pgvector como requisitos constitucionales (bajados a "implementación sugerida").
- Templates: ✅ sin cambios requeridos (usan placeholders dinámicos).
- Follow-up TODOs: alinear docker-compose (referencia a worker-fastapi inexistente).
-->
# Odiseo Constitution

## Preámbulo: Principios vs. Implementación

Esta constitución distingue dos capas:

- **Invariantes (Principios)**: reglas que NO pueden violarse nunca porque
  protegen al negocio o evitan riesgos reales (fugas de datos, caída de la API,
  pérdida de la fuente de verdad). Cambiarlas exige una enmienda MAYOR.
- **Implementación Vigente**: el stack y las técnicas concretas que hoy realizan
  esos principios. Son ENMENDABLES vía MINOR/PATCH sin ceremonia mayor, siempre
  que la nueva implementación siga cumpliendo los invariantes.

Un antipatrón es una violación de un **invariante**, no de una elección de stack.

## Core Principles (Invariantes — No Negociables)

### I. Identidad del Proyecto
El ecosistema Odiseo se divide en dos dominios estrictamente separados:
- **Core (Banco de Preguntas)**: repositorio global y fuente única de verdad
  para reactivos, textos de comprensión y saberes previos.
- **Motor de Entrega (SaaS B2B)**: plataforma de suscripción que consume datos
  del Core para planificación académica y generación de materiales.

### II. Invariantes Arquitectónicos
1. **Aislamiento multi-tenant**: schema-per-tenant en PostgreSQL. Queda prohibido
   el Row-Level Tenancy para aislar la data principal del motor B2B. Cero fugas
   de datos entre empresas.
2. **Separación de dominios**: el SaaS B2B NUNCA almacena el contenido pesado de
   los reactivos ni multimedia; únicamente guarda referencias lógicas
   (`question_id`).
3. **Cómputo pesado fuera del proceso de la API**: todo procesamiento intensivo
   (compilación/ensamblaje de documentos, render con navegador headless, etc.)
   DEBE ejecutarse en un proceso o deployment separado del que atiende las
   peticiones HTTP. El *principio* es el aislamiento del cómputo por perfil de
   carga; la *tecnología* que lo logra es implementación vigente.
4. **Idempotencia de jobs asíncronos**: todo trabajo en background DEBE poder
   reintentarse sin corromper el estado (sin duplicar registros de uso, sin
   doble despacho). Las transiciones de estado se protegen contra reejecución.

### III. Implementación Vigente (ENMENDABLE)
> Esta sección describe el stack actual. Puede cambiar vía MINOR/PATCH mientras
> se respeten los invariantes de la sección II.

- **Motor SaaS B2B**: NestJS (Node.js) con TypeScript estricto.
- **Cómputo pesado (generación de PDF)**: worker Node aislado (proceso/deployment
  separado de la API), orquestado con BullMQ sobre Redis. Render HTML→PDF con
  navegador headless mediante un **pool reutilizable** (no un lanzamiento por
  documento). *No se exige FastAPI ni Fargate; se exige el aislamiento del punto
  II.3.*
- **Base de datos**: PostgreSQL. Particionamiento y pgvector se adoptan solo
  cuando exista una necesidad concreta (volumen, búsqueda semántica).
- **Almacenamiento de artefactos**: S3 (o compatible). Multimedia firmada vía GCS.
- **Notificación de fin de job**: el canal más simple que cumpla el SLA
  (polling o SSE al inicio; canales persistentes solo si el negocio lo justifica).

### IV. Estándares de Calidad
- Las funciones de actualización de estado DEBEN mutar y retornar `void` (o el
  equivalente sin valor de retorno del lenguaje). Las funciones de base de datos
  en PostgreSQL retornan tipos exactos y cuentan con cobertura de pruebas.
- **Nombres en BD**: todas las tablas, columnas, índices, constraints y funciones
  en inglés `snake_case`. Prohibido español u otros idiomas en la capa de datos.
- **Contratos de integración** definidos y versionados entre el SaaS y el Core.
- **UX & Notificaciones**: acciones del usuario (éxito, error, borrado) se
  notifican con UI no bloqueante (Toasts). NUNCA `alert()` nativo del navegador.

### V. Restricciones de Integración
- **Acceso al Core**: el SaaS B2B accede al banco **solo de lectura** y **detrás
  de una capa anticorrupción** (un único adaptador/repositorio que aísla el
  esquema del banco del resto del código; columnas explícitas, sin `SELECT *`
  desparramado). Cuando el banco opere como servicio independiente, la
  comunicación migra a un contrato REST/mensajería. Queda prohibido el acceso
  directo y disperso al esquema del banco desde múltiples módulos.
- **Aislamiento de credenciales**: las empresas operadoras del SaaS jamás reciben
  conexión de escritura a la base global del banco.

### VI. Supuestos de Escalabilidad
- **Modelo multi-tenant**: schema-per-tenant; cada empresa reside en su propio
  esquema aislado, provisionado mediante migraciones versionadas por tenant.
- **Escalado del cómputo**: el worker de PDF escala de forma independiente de la
  API. El render usa un pool de navegadores acotado por recursos.

### VII. Puntos de Control (Governance Checkpoints)
- Los cambios de estructura de BD se manejan con migraciones automatizadas;
  los cambios de esquema B2B requieren revisión arquitectónica.
- Toda pregunta debe estar verificada o aprobada antes de ser visible en el SaaS.

### VIII. Antipatrones (violación de invariantes = rechazo de PR)
- **NUNCA** ejecutar compilación/render de PDF (navegador headless) dentro del
  proceso que atiende las peticiones HTTP. (Invariante II.3)
- **NUNCA** usar Row-Level Tenancy para aislar la data principal del motor B2B.
  (Invariante II.1)
- **NUNCA** eliminar semanas o ciclos inactivos en la gestión de tiempo académico;
  se preservan como registros (con marca de inactividad / campos en null) para
  mantener la alineación estricta con el frontend.
- **NUNCA** acceder al esquema del banco de forma directa y dispersa; todo acceso
  pasa por la capa anticorrupción de lectura. (Invariante — Restricción V)
- **NUNCA** persistir contenido pesado de reactivos en el SaaS B2B. (Invariante II.2)
- **NUNCA** dejar un job asíncrono sin protección de idempotencia. (Invariante II.4)

### IX. Métricas de Éxito
- Cero fugas de datos entre empresas B2B.
- La API mantiene su latencia bajo carga de generación (el cómputo pesado no la
  degrada, por estar aislado).
- Reintentos de jobs sin efectos secundarios duplicados.

## Governance

- **Naturaleza de las reglas**: cada regla es un **Invariante** (Secciones I, II,
  IV, V, VI, VII, VIII, IX) o **Implementación Vigente** (Sección III). Cambiar
  un invariante es enmienda MAYOR; cambiar la implementación vigente es MINOR/PATCH
  y no requiere revisión constitucional mayor, siempre que los invariantes se
  sigan cumpliendo.
- **Amendment Procedure**: las enmiendas a invariantes requieren documentación,
  revisión arquitectónica y plan de migración. Las de implementación vigente
  requieren solo la nota del cambio y verificación de que ningún invariante se rompe.
- **Versioning Policy**: SemVer. MAJOR = cambio a un invariante o reestructuración;
  MINOR = nueva guía o cambio de implementación vigente; PATCH = correcciones menores.
- **Compliance Review**: todo PR verifica el cumplimiento de los Invariantes
  (Sección II y Restricciones de Integración). La violación de un antipatrón
  (Sección VIII) es causa de rechazo de PR. Las decisiones de stack dentro de la
  Sección III no bloquean por sí mismas.

**Version**: 2.0.0 | **Ratified**: 2026-06-14 | **Last Amended**: 2026-07-17
