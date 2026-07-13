# Data Model: Quick Onboarding

This document specifies the database updates and new entities required to track onboarding progress and handle demo data.

---

## 1. Schema Upgrades (Tenant Schema)

We will introduce a new tracking table and modify existing tenant entities to support the demo flag. All names strictly follow the **English snake_case** naming convention.

### A. New Table: `onboarding_progress`
Tracks the tenant's onboarding milestone completion and visibility state.

| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY`, default `gen_random_uuid()` | Unique identifier. |
| `steps_completed` | `JSONB` | `NOT NULL`, default `'[]'` | JSON array of completed step IDs. |
| `is_dismissed` | `BOOLEAN` | `NOT NULL`, default `false` | Indicates if the coordinator closed the widget. |
| `created_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL`, default `now()` | Record creation timestamp. |
| `updated_at` | `TIMESTAMP WITH TIME ZONE` | `NOT NULL`, default `now()` | Last update timestamp. |

### B. Modified Existing Tables (Columns to Add)
We add the `is_demo` flag to allow cascading deletion and data separation.

#### Table: `cycles`
* Add: `is_demo BOOLEAN NOT NULL DEFAULT false`

#### Table: `pdf_design_templates`
* Add: `is_demo BOOLEAN NOT NULL DEFAULT false`

#### Table: `syllabus`
* Add: `is_demo BOOLEAN NOT NULL DEFAULT false`

---

## 2. Relationships & Cascade Rules

* `cycles` -> `cycle_weeks` (Cascades on delete).
* `cycles` -> `cycle_material_templates` (Cascades on delete).
* `cycle_material_templates` -> `cycle_material_template_courses` (Cascades on delete).
* `syllabus` -> `syllabus_distribution` (Set Null/Cascades on delete).

When the admin wipes demo data:
1. `DELETE FROM "${schemaName}".syllabus WHERE is_demo = true;` (trims distribution).
2. `DELETE FROM "${schemaName}".pdf_design_templates WHERE is_demo = true;`
3. `DELETE FROM "${schemaName}".cycles WHERE is_demo = true;` (trims weeks, templates, course structures).
4. Reset `steps_completed` in `onboarding_progress` to empty `[]`.
