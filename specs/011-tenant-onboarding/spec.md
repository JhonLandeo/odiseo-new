# Feature Specification: Quick Onboarding (Spotlight Walkthrough & No Demo Data)

**Feature Branch**: `011-tenant-onboarding`

**Created**: 2026-07-13

**Status**: Draft

**Input**: User description: "Tour superpuesto tipo spotlight que oscurece el fondo e indica exactamente dónde dar click, eliminando la carga de datos demo"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Spotlight Walkthrough Tour (Priority: P1)

**Description**: 
When a new tenant administrator logs in for the first time, a global interactive tour (`AppTour.vue`) activates. The entire screen darkens with a backdrop overlay, and a "spotlight" highlights the exact real button they need to click to begin their setup (e.g., "Crear Ciclo"). A floating popover explains what to do. The user must create real data rather than relying on demo data, ensuring that their first interaction leaves them with a usable production configuration. **Crucially, when the user clicks the highlighted button to start an action (like filling a form), the spotlight and overlay instantly disappear**, allowing free interaction. Upon saving the form successfully, the overlay reappears pointing to the next step.

**Why this priority**: 
Eliminates the "cold start" problem while avoiding the complexity and data pollution of demo records. It forces the user to learn by doing in the actual interface, without the tour becoming an obstacle.

**Independent Test**: 
A brand new tenant logs in, the screen darkens, and a bright spotlight highlights the "Configurar Ciclo" button. Clicking it navigates to Cycles creation. The overlay disappears. The user saves the cycle. A confetti animation triggers, the screen darkens again, and the spotlight now points to "Plantillas PDF".

**Acceptance Scenarios**:

1. **Given** a new tenant dashboard, **When** the page loads, **Then** the screen dims and a spotlight highlights the next required action in the platform.
2. **Given** the spotlight is pointing to an action button, **When** the user clicks it, **Then** the overlay and spotlight disappear to allow uninterrupted form interaction.
3. **Given** the user successfully creates a milestone record (e.g. a Cycle, a PDF Template), **When** the process completes, **Then** a confetti animation triggers, and the spotlight overlay returns to highlight the next milestone.
4. **Given** a tenant who has completed all setup milestones, **When** they log in, **Then** the tour does not activate.

---

### User Story 2 - Tour Dismissal and Reset (Priority: P2)

**Description**: 
The interactive spotlight tour can be dismissed at any time by the user via a prominent "Saltar tutorial" button that is *always* present in the spotlight popover, even if not completed. Furthermore, if a tenant admin wants to restart the tour to guide another team member, they can do so from their profile or settings section.

**Why this priority**: 
Empowers the user to skip the guided tour if they are already experienced, preventing frustration.

**Independent Test**: 
The admin sees the tour popover, clicks the always-visible "Saltar tutorial" button, and the spotlight overlay disappears permanently. They go to Settings, click "Reiniciar Tour", and the spotlight reappears.

**Acceptance Scenarios**:

1. **Given** the tour popover is visible, **When** the user looks at it, **Then** they will always see a clear "Saltar tutorial" (Skip) action.
2. **Given** the tour popover is visible, **When** the user clicks "Saltar tutorial", **Then** the tour is permanently hidden for that user session and marked as dismissed.
3. **Given** the user navigates to Settings, **When** they click "Reiniciar Tour", **Then** the tour state is reset and the spotlight reappears on the first incomplete milestone.

---

### User Story 3 - Global Support Helper Widget (Priority: P3)

**Description**: 
A floating "Help" or "Support" widget is permanently accessible in the bottom right corner of the application. When clicked, it opens a popover or modal that provides contextual help. It includes a link to contact high-touch support via WhatsApp, a visual "Mental Model" diagram of the system flow (Cycle ➔ Template ➔ Syllabus ➔ Material), contextual FAQs based on the current page, and an option to reactivate the onboarding tour if the user previously dismissed it. This centralized helper replaces the need for an isolated "Reset Tour" button in the configuration settings.

**Why this priority**: 
Provides a safety net for users who skip the tour but still need guidance, and facilitates direct communication for B2B relationship building.

**Independent Test**: 
The user clicks the floating help icon. A menu appears. They click "Ver cómo funciona Odiseo" and a diagram opens. They click "Contactar por WhatsApp" and a new tab opens to the support line. They click "Volver a mostrar el tutorial" and the spotlight tour starts again.

**Acceptance Scenarios**:

1. **Given** the user is anywhere in the dashboard, **When** they click the floating help button, **Then** a support menu opens.
2. **Given** the support menu is open, **When** the user clicks the WhatsApp option, **Then** they are redirected to a WhatsApp chat with support.
3. **Given** the support menu is open, **When** the user clicks "Reiniciar Tour", **Then** the onboarding tour state resets and begins immediately.
4. **Given** the user wants to understand the system, **When** they select the diagram option, **Then** a visual representation of the core system flow is displayed.

---

### Edge Cases

- **Dynamic Element Loading**: The spotlight must wait for the target DOM element (like a button) to be rendered before calculating its position and applying the highlight mask.
- **Responsive Layouts**: If the highlighted element changes position due to window resizing, the spotlight must recalculate its coordinates instantly.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST detect if a tenant is in an "onboarding phase" by checking if core records (Cycles, Templates, Syllabus) exist in the tenant schema.
- **FR-002**: The frontend MUST implement a global `AppTour.vue` component that can draw a spotlight mask over any target DOM element using its bounding client rect.
- **FR-003**: The frontend MUST darken all other areas of the screen (z-index overlay) preventing clicks outside the spotlighted element or the tour popover, BUT MUST instantly hide this overlay once the spotlighted element is clicked to unblock form interactions.
- **FR-004**: The system MUST track the sequential status of the 4 onboarding steps (`create_cycle`, `create_pdf_template`, `setup_syllabus`, `generate_material`) at the tenant level, waiting for successful saves to advance.
- **FR-005**: The frontend MUST integrate `canvas-confetti` to trigger visual feedback upon step completion.
- **FR-006**: The tour popover MUST always include a "Saltar tutorial" (dismiss) action in every step.
- **FR-007**: The frontend MUST implement a globally accessible floating action button (FAB) for the Support Helper Widget.
- **FR-008**: The Support Helper Widget MUST contain an external link to WhatsApp, a modal/view for the system flow diagram, and the "Reset Tour" action.

### Key Entities

- **OnboardingProgress**: Tracks the completion status of the onboarding milestones for the tenant.
  * Attributes: `tenant_id` (String), `steps_completed` (JSONB/Array of strings), `is_dismissed` (Boolean), `updated_at` (Timestamp).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 85% of new tenant admins who start the tour create their first real academic cycle within 5 minutes of signup.
- **SC-002**: Average time from signup to first generated test PDF decreases from 15 minutes to under 5 minutes.
- **SC-003**: Support tickets related to "how do I start" or "blank dashboard" drop by at least 60% within the first month of deployment.
- **SC-004**: 90% of tenants complete or dismiss the spotlight tour within 48 hours of account activation.

---

## Assumptions

- **DOM Identifiers**: All critical buttons ("Crear Ciclo", "Nuevo Syllabus") have unique IDs or data-attributes so the tour component can reliably target them.
- **Routing**: The tour can force navigation to the correct page if the target element is not on the current route.
