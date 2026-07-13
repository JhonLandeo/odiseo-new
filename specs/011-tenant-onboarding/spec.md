# Feature Specification: Quick Onboarding (Actionable Empty States & Gamified Checklist)

**Feature Branch**: `011-tenant-onboarding`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "onboarding rapido - Estados Vacíos Accionables + Checklist gamificado"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Actionable Empty States (Priority: P1)

**Description**: 
When a new tenant administrator or coordinator logs in to the platform for the first time, they face empty sections (no cycles, no syllabus, no materials). Instead of viewing a stark blank screen or default empty message, they are greeted by premium, interactive cards explaining the value of the section, accompanied by two primary actions: "Cargar Datos Demo" (Load Demo Data) and "Crear manualmente" (Create manually). Clicking "Cargar Datos Demo" instantly provisions temporary seed data (a sample cycle, a template, and a basic syllabus) in their tenant schema so they can explore the UI immediately.

**Why this priority**: 
Crucial for the MVP. It eliminates the "cold start" problem where a new user does not know how to populate the system and cannot see its value.

**Independent Test**: 
A brand new tenant account with 0 records logs in, visits the dashboard, clicks "Cargar Datos Demo", and immediately sees the academic cycles list, a sample syllabus, and dashboard graphs filled with sample statistics.

**Acceptance Scenarios**:

1. **Given** a tenant schema with no academic cycles, **When** the coordinator accesses the Cycles page, **Then** they see a premium illustration explaining academic time, a "Cargar Ciclo de Demostración" button, and a "Crear Ciclo" button.
2. **Given** a user clicks "Cargar Ciclo de Demostración", **When** the process completes, **Then** the page reloads, displays a sample cycle ("Ciclo de Demostración 2026"), and shows a success toast notification.
3. **Given** a tenant schema that already contains at least one cycle, **When** the coordinator accesses the Cycles page, **Then** the regular cycles list is displayed, and the onboarding empty state card is hidden.

---

### User Story 2 - Onboarding Progress Checklist (Priority: P2)

**Description**: 
A persistent but minimizable checklist widget is displayed on the main B2B Dashboard for new tenants. It lists 4 fundamental milestones required to successfully configure the academic environment. As the user completes each action (e.g. creating/loading a cycle, creating a PDF template, configuring a syllabus, and generating a test PDF), the checklist dynamically marks the item as completed with smooth animations and updates a progress bar.

**Why this priority**: 
Guides the user self-sufficiently through the initial setup sequence without needing training manuals or human-led calls.

**Independent Test**: 
The coordinator logs in, sees the checklist widget at 0%, completes the first task, and witnesses the progress bar jump to 25% with the corresponding task checked.

**Acceptance Scenarios**:

1. **Given** a new tenant dashboard, **When** the page loads, **Then** a floating dashboard widget labeled "Comencemos tu configuración" is visible, showing 4 steps at 0% progress.
2. **Given** the coordinator completes one of the steps (e.g. configures a PDF template), **When** they return to the dashboard, **Then** that step is checked off, progress is updated to 25%, and a congratulations tooltip is briefly shown.
3. **Given** the checklist progress reaches 100%, **When** the user clicks "Finalizar Onboarding", **Then** the checklist is permanently dismissed, a success toast appears, and the widget never displays again for that tenant.

---

### User Story 3 - Onboarding State Dismissal and Reset (Priority: P3)

**Description**: 
The onboarding checklist can be minimized or dismissed at any time by the user, even if not completed. Furthermore, if a tenant admin wants to clear the demo data and reset the checklist to start clean, they can do so from their profile or settings section.

**Why this priority**: 
Empowers the user to skip the guided onboarding if they are already experienced or want to start inputting real data immediately.

**Independent Test**: 
The admin clicks "Ocultar guía" on the widget, and the widget disappears. They go to Settings, click "Reiniciar Onboarding", and the widget reappears at its current progress.

**Acceptance Scenarios**:

1. **Given** the checklist widget is visible on the dashboard, **When** the user clicks "Minimizar", **Then** it collapses into a small, floating bubble icon.
2. **Given** the user clicks "Omitir configuración" on the widget, **When** confirmed, **Then** the widget is hidden from the dashboard.
3. **Given** demo data is active in the tenant schema, **When** the admin clicks "Limpiar Datos Demo" in settings, **Then** all generated demo records are safely deleted, and the checklist steps are updated back to incomplete.

---

### Edge Cases

- **Concurrent coordinators updating state**: If two coordinators work on the same tenant schema, step completion must synchronize in real-time or update on page reload based on the tenant's database state.
- **Deleting demo data while active resources exist**: If a user generates a real material that references a demo cycle, the system must prevent deletion of the demo cycle or cascade-migrate the reference gracefully.
- **Partial demo generation failure**: If the database transaction fails while inserting demo data, the system must roll back completely and display a user-friendly error toast instead of leaving the database in a corrupt, half-seeded state.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect if a tenant is in an "onboarding phase" by checking if any real cycles exist in the tenant schema.
- **FR-002**: The system MUST provide an endpoint to provision a predefined set of demo records (1 Cycle, 2 weeks, 1 PDF design template, and 1 Syllabus with 2 distribution entries).
- **FR-003**: The system MUST mark all demo records with an `is_demo` flag set to `true` to distinguish them from production records.
- **FR-004**: The system MUST allow the purging of all records marked `is_demo = true` in a single database transaction.
- **FR-005**: The system MUST track the status of the 4 onboarding steps (`load_demo_or_create_cycle`, `create_pdf_template`, `setup_syllabus`, `generate_material`) at the tenant level.
- **FR-006**: The frontend MUST show/hide the onboarding checklist widget on the dashboard based on the tenant's completion status.
- **FR-007**: The frontend MUST use non-blocking toasts and native Nuxt UI components for all onboarding alerts, warnings, and success messages.

### Key Entities

- **OnboardingProgress**: Tracks the completion status of the onboarding milestones for the tenant.
  * Attributes: `tenant_id` (String), `steps_completed` (JSONB/Array of strings), `is_dismissed` (Boolean), `updated_at` (Timestamp).
- **DemoEntityFlag**: Any entity (Cycle, Syllabus, PDFTemplate) must support a flag indicating it was populated via onboarding demo.
  * Attributes: `is_demo` (Boolean, defaults to false).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 85% of new tenant admins who click "Cargar Datos Demo" navigate to another section and perform an action (like viewing a syllabus or downloading a PDF) within 5 minutes of signup.
- **SC-002**: Average time from signup to first generated test PDF decreases from 15 minutes to under 4 minutes.
- **SC-003**: Support tickets related to "how do I start" or "blank dashboard" drop by at least 60% within the first month of deployment.
- **SC-004**: 90% of tenants complete or dismiss the checklist within 48 hours of account activation.

---

## Assumptions

- **Tenant Isolation**: Seeding demo data only writes to the specific tenant's isolated PostgreSQL database schema.
- **Clean start**: The "Cargar Datos Demo" action is only available when the tenant schema has zero registered academic cycles.
- **Standard content**: The demo syllabus and distribution link to standard, existing global courses and topics from the `public` schema.
