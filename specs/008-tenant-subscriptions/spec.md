# Feature Specification: Gestión de Tenants y Suscripciones

**Feature Branch**: `[008-tenant-subscriptions]`

**Created**: 2026-07-12

**Status**: Draft

**Input**: User description: "Necesito la gestion de empresas(tenants), motor de planes y suscripciones mas su dashboard de consumo e infraestructura"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear y Configurar Nueva Empresa (Tenant) (Priority: P1)

Como Super Administrador, quiero registrar una nueva empresa y asignarle un plan, para que puedan acceder al SaaS B2B con su propio esquema aislado.

**Why this priority**: Es el paso fundamental para incorporar nuevos clientes a la plataforma.

**Independent Test**: Se puede probar registrando un tenant y verificando que el sistema aprovisiona correctamente su esquema de base de datos.

**Acceptance Scenarios**:

1. **Given** un Super Administrador autenticado, **When** registra un tenant con un plan "Básico", **Then** el sistema crea el tenant, aprovisiona su esquema de BD y lo marca como activo.
2. **Given** un nombre de subdominio ya en uso, **When** el Super Admin intenta registrar un nuevo tenant, **Then** el sistema arroja un error de validación.

---

### User Story 2 - Gestionar Planes de Suscripción (Priority: P2)

Como Super Administrador, quiero definir y editar planes de suscripción (ej. Básico, Pro, Enterprise) con límites específicos, para ofrecer distintas opciones comerciales.

**Why this priority**: Permite monetizar y restringir funcionalidades según el nivel de pago acordado con la empresa.

**Independent Test**: Se puede probar creando un plan con ciertas restricciones de límite de usuarios y asignándolo a un tenant existente.

**Acceptance Scenarios**:

1. **Given** un Super Administrador, **When** crea un plan con límite de 1000 usuarios, **Then** el plan queda disponible en el sistema para ser asignado.

---

### User Story 3 - Visualizar Dashboard de Consumo (Priority: P2)

Como Super Administrador, quiero ver un dashboard con el consumo de recursos de cada empresa, para monitorear el uso de la infraestructura y tomar decisiones de facturación o upgrade.

**Why this priority**: Proporciona visibilidad operativa y de negocio sobre el uso real del sistema.

**Independent Test**: Se puede probar generando actividad en un tenant y validando que las métricas del dashboard se actualicen correspondientemente.

**Acceptance Scenarios**:

1. **Given** múltiples tenants activos con consumos distintos, **When** el Super Admin accede al dashboard central, **Then** visualiza las métricas agregadas por empresa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir el registro, edición, suspensión y reactivación de empresas (tenants).
- **FR-002**: El sistema DEBE aprovisionar automáticamente el esquema de base de datos ("schema-per-tenant") para cada empresa nueva registrada.
- **FR-003**: El sistema DEBE permitir la creación y edición de Planes de Suscripción con límites configurables (ej. cantidad de usuarios, cantidad de silabos).
- **FR-004**: El sistema DEBE registrar métricas de consumo de cada tenant para ser visualizadas en el dashboard.
- **FR-005**: El sistema DEBE procesar el cobro y la facturación de las suscripciones mediante **gestión manual/offline**. Los upgrades o downgrades de plan se aplican de forma **inmediata** en el sistema en cuanto el Super Admin modifica el tenant; cualquier prorrateo o ajuste financiero será responsabilidad humana y externa al software.
- **FR-006**: El sistema DEBE responder a los límites de plan excedidos aplicando un **bloqueo diferido**. Se otorgará un periodo de gracia (ej. 3 días) antes de aplicar un bloqueo estricto. Durante este periodo, el sistema DEBE mostrar un banner de advertencia persistente *únicamente* a los usuarios con rol de Administrador/Director del tenant, evitando interrumpir a los usuarios regulares.
- **FR-007**: El dashboard de infraestructura DEBE mostrar las siguientes métricas de consumo: **volumen de procesamiento real (cantidad de páginas generadas en PDFs y cantidad de preguntas consumidas), usuarios activos de la empresa y cuota de almacenamiento (DB/S3)**.
- **FR-008**: En caso de cancelación definitiva o exceder el periodo de gracia y suspensión de la empresa, el sistema DEBE aplicar una retención **Soft-delete**. El esquema de BD y los datos permanecen intactos, pero el tenant es inhabilitado lógicamente (`is_active=false`) previniendo acceso.

## Clarifications

### Session 2026-07-12
- Q: Retención de Datos en Cancelación/Suspensión prolongada → A: Opción A - Soft-delete: El esquema del cliente y sus datos permanecen intactos en PostgreSQL, pero el Tenant se marca como is_active=false denegando cualquier inicio de sesión.
- Q: Notificaciones del "Bloqueo Diferido" (Soft-Limit) → A: Opción B - Banner Administrativo: Una alerta persistente visible únicamente para los usuarios con rol de Administrador/Director del colegio.
- Q: Granularidad de las Métricas → A: Opción B - Mensual: Las métricas de consumo se almacenan como acumulados mensuales por tenant, alineándose al ciclo de facturación.
- Q: Upgrades/Downgrades a Mitad de Mes → A: Opción A - Aplicación Inmediata: El nuevo plan y sus límites rigen desde el instante exacto en que el Super Admin lo cambia, manejando el prorrateo offline.
- Q: La Métrica de Valor Central (¿Por qué cobramos?) → A: Opción B - Puramente por Consumo de Infraestructura: El plan se define por páginas PDF y preguntas (antiguamente reactivos).

### Key Entities

- **Tenant (Empresa)**: Representa a la organización cliente. Contiene el subdominio, nombre comercial, estado (activo/suspendido) y referencia al plan de suscripción.
- **SubscriptionPlan (Plan)**: Modelo comercial. Define los límites y el precio asociado a un nivel de servicio.
- **ConsumptionMetric (Consumo)**: Registro de uso consolidado mensualmente por tenant (un registro por mes, por tipo de métrica), minimizando el volumen de datos e impulsando consultas rápidas en el dashboard.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Los administradores pueden dar de alta un nuevo tenant y aprovisionar su esquema en menos de 2 minutos.
- **SC-002**: El dashboard refleja los consumos operativos de los tenants con una latencia de actualización no mayor a 1 hora (u optimizada asíncronamente).
- **SC-003**: El 100% de los intentos de crear recursos (usuarios, sílabos) por encima de los límites del plan son detectados por el motor de restricciones.

## Assumptions

- Siguiendo la *Odiseo Constitution* (Schema-per-tenant), los datos globales (Tenants, Planes de Suscripción, Métricas Globales) residirán en el esquema `public`, mientras que los datos de la operativa escolar residirán en el esquema del tenant.
- La recolección de métricas para el dashboard de infraestructura se procesará de forma asíncrona para no afectar el rendimiento de la aplicación transaccional B2B (Asincronía Extrema).
