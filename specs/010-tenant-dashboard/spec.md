# Feature Specification: B2B Tenant Dashboard with Cycle Breakdown

**Feature Branch**: `[010-tenant-dashboard]`

**Created**: 2026-07-12

**Status**: Completed

**Input**: User description: "cuantificar cuantos materiales ha generado con sus preguntas respectivas, considerando que podemos tener varios ciclos activos, consolidando el consumo a nivel tenant y desglosando por ciclo"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Global Tenant Consumption Metrics (Priority: P1)

The institution director needs a consolidated view of their overall usage (Total PDFs, Total Questions used, and Manual Replacements/Curation Rate) across the entire tenant workspace to monitor consumption against their billing plan limits.

**Why this priority**: It is the primary financial and operational metric that justifies subscription tiers and alerts the school admin when they approach their usage limit.

**Independent Test**: Can be validated by checking the dashboard metrics cards after generating new PDFs or performing question replacements, ensuring the numbers increment accordingly.

**Acceptance Scenarios**:
1. **Given** an institution with multiple cycles, **When** the administrator opens the dashboard, **Then** they see cards showing the global total of generated materials, total questions consumed, and manual replacements.
2. **Given** a new PDF is generated in any cycle, **When** the dashboard is loaded, **Then** the global count of materials and questions is updated instantly.

---

### User Story 2 - Comparative Cycle-Level Breakdown (Priority: P1)

The academic coordinator needs to view a breakdown of consumption and configurations segmented by cycle (since multiple cycles can run actively at the same time), so they can check which cycles are actively producing materials.

**Why this priority**: Without this, a school running multiple cycles simultaneously has no way of telling where their plan quotas are being spent.

**Independent Test**: Can be tested by verifying that the "Consumo por Ciclo" card contains one row per academic cycle and that the metrics match the exact sum of requests in each specific cycle.

**Acceptance Scenarios**:
1. **Given** multiple active cycles, **When** the administrator views the "Consumo por Ciclo" panel, **Then** they see each cycle listed with its name, status (Active/Closed), generated PDFs count, consumed questions count, and active syllabus count.

---

### User Story 3 - Activity Tracking with Cycle Tags (Priority: P2)

Academic staff need to see the latest generation attempts listed with a clear badge indicating which cycle they belong to, enabling quick access to views/downloads.

**Why this priority**: Speeds up navigation by letting coordinators quickly find their cycle's recent PDFs without having to filter the full history page.

**Independent Test**: Can be tested by verifying that the "Actividad de Generación Reciente" table lists the cycle name under each template name.

**Acceptance Scenarios**:
1. **Given** recent generations across different cycles, **When** the recent history table loads, **Then** each row displays the template name, week, status, date, and a sub-label identifying the source cycle.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an API endpoint (`/api/v1/materials/dashboard/metrics`) protected by tenant context that compiles global and cycle-level usage metrics.
- **FR-002**: System MUST aggregate global tenant-level counts for completed material requests, total questions, and replaced questions.
- **FR-003**: System MUST calculate comparative metrics (PDF count, question usage, active syllabus count) for each cycle in the tenant schema.
- **FR-004**: System MUST return the 5 most recent material requests, including their week number, status, template name, creation time, and associated cycle name.
- **FR-005**: Frontend MUST render Bento-style statistical cards with icons showing total materials, total questions, manual replacements, and curation percentage.
- **FR-006**: Frontend MUST render a "Consumo por Ciclo" panel showing comparative rows for each cycle.
- **FR-007**: Frontend MUST label each recent generation history row with its corresponding cycle name.
- **FR-008**: Frontend MUST render skeleton loader cards and tables while the API request is loading.

### Key Entities *(include if feature involves data)*

- **Cycle**: The academic term boundaries (e.g., Pre-University, Regular 2026-I) containing course offerings and materials.
- **MaterialRequest**: The request submitted to generate a compiled PDF for a week.
- **MaterialQuestionUsage**: Individual questions extracted and assigned to a generated material.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dashboard page loads and completes all queries in under 500ms.
- **SC-002**: 100% of material requests are correctly scoped and segmented under their respective cycles in the breakdown.
- **SC-003**: Skeletons are visible during loading, preventing layout shifts when data arrives.

## Assumptions

- Multiple academic cycles can be set as `is_active = true` simultaneously.
- A central tenant-wide subscription limit is enforced at the account level rather than per-cycle.
