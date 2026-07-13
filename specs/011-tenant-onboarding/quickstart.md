# Quickstart Validation Guide: Quick Onboarding

This document guides you through verifying the B2B Tenant Onboarding feature end-to-end.

---

## Prerequisites
* PostgreSQL running locally.
* A freshly registered B2B Tenant schema (e.g. `tenant_test`).
* Authenticated coordinator or admin user.

---

## Validation Scenario 1: Initial Cold Start & Empty State
Verify that a new tenant sees the onboarding empty state.

1. **Setup**: Wipe any cycles in the tenant schema:
   ```sql
   DELETE FROM "tenant_test".cycles;
   ```
2. **Action**: Open the browser and visit `http://test.localhost:3001/academic-time`.
3. **Expected Outcome**:
   * Skeletons flash.
   * A premium illustration card titled *"Organiza tus Ciclos Académicos"* appears.
   * Action buttons *"Cargar Ciclo de Demostración"* and *"Crear Ciclo"* are visible.
   * No tables are displayed.

---

## Validation Scenario 2: Load Demo Data
Verify that clicking "Cargar Datos Demo" successfully seeds the database and advances the onboarding progress.

1. **Action**: Click *"Cargar Ciclo de Demostración"* on the empty state card.
2. **Expected Outcome**:
   * A non-blocking toast *"Datos de demostración cargados exitosamente"* appears.
   * The page reloads automatically.
   * A table showing *"Ciclo de Demostración 2026"* (labeled with a blue "Demo" badge) appears.
   * Navigate to Dashboard (`http://test.localhost:3001/`): The onboarding progress checklist is displayed with *"Cargar datos demo"* checked off (25% progress).

---

## Validation Scenario 3: Progress Checklist Completion
Verify that completing academic actions checks off the checklist items.

1. **Action**: Navigate to `http://test.localhost:3001/config` (PDF Design Templates).
2. **Action**: Create a new PDF design template and save it.
3. **Action**: Navigate back to Dashboard (`/`).
4. **Expected Outcome**:
   * The onboarding checklist now marks *"Configurar plantilla de diseño PDF"* as checked (50% progress).

---

## Validation Scenario 4: Clean/Purge Demo Data
Verify that resetting onboarding deletes all test records safely.

1. **Action**: Navigate to profile/institution settings and click *"Limpiar Datos Demo"*.
2. **Expected Outcome**:
   * Confirmation modal appears (using Nuxt UI Modal).
   * After confirming, database sweeps tables, leaving real user records intact.
   * Navigating to `/academic-time` returns you to the cold start empty state.
   * Onboarding checklist resets to 0% progress.
