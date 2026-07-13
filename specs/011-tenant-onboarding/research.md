# Research & Decisions: Quick Onboarding

This document summarizes the technical decisions, architecture, and rationale for the B2B Tenant Onboarding feature.

---

## 1. Onboarding Step Tracking

### Decision
Store the onboarding progress in a database table called `onboarding_progress` inside each tenant's isolated schema.

### Rationale
* **Consistency**: Onboarding progress is shared across all coordinators and administrators of the same tenant (e.g., if one coordinator creates a cycle, another coordinator sees that step as completed on the dashboard).
* **Security & Isolation**: Storing it in the tenant schema complies with the project's schema-per-tenant isolation architecture.

### Alternatives Considered
* **LocalStorage**: Rejected because it is client-specific. If the coordinator logs in from another computer, their progress would be lost, and other coordinators wouldn't see it.
* **Global public schema table**: Rejected because it violates tenant schema separation principles.

---

## 2. Provisioning Demo Data

### Decision
Implement a backend service that runs an atomic SQL transaction to seed sample records with the flag `is_demo = true`.

### Rationale
* **Safety**: If any table insert fails (e.g., due to database constraint changes), the transaction is fully rolled back, preventing corrupted state.
* **Traceability**: The `is_demo = true` column allows easy identification, filtering, and purging of all demo records.

### Alternatives Considered
* **Frontend-only mocking**: Rejected because the user cannot perform real actions (like auditing, editing, or compiling PDFs) without actual database records. Seeding real database records allows the full system to function seamlessly.

---

## 3. Purging Demo Data

### Decision
A safe delete query that sweeps all tables in the tenant schema, deleting rows where `is_demo = true`.

### Rationale
* **Clean State**: Admins want to wipe test data before starting real academic planning. A single transaction sweeps and purges demo records.
* **Constraint Handling**: Standard relational constraints (`ON DELETE CASCADE`) are utilized on references (like `cycle_weeks` and `syllabus_distribution`) to ensure a clean sweep.
