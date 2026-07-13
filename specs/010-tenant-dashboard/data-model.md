# Data Model Analysis: B2B Tenant Dashboard

This document details the database queries and schema mappings used to construct consolidated tenant-level and cycle-level metrics in the multi-tenant database.

## Database Objects

The metrics are computed dynamically by querying tables within the tenant's private schema.

### 1. `material_requests`
* Represents a PDF generation task.
* Used to count completed materials (status in `COMPLETED`, `COMPLETED_WITH_WARNINGS`) and recent generation activity.

### 2. `material_question_usage`
* Represents a question used in a compiled material.
* Contains a boolean flag `was_replacement` identifying manual replacements.
* Used to compute the overall curation/replacement efficiency.

### 3. `cycles`
* Academic term scopes.
* Used to group and segment PDF counts, question usages, and active syllabus counts.

### 4. `syllabus`
* Course schedules.
* Counted per cycle to verify academic configuration health.

## Core SQL Queries

### A. Tenant-Level Aggregates
```sql
-- Total Completed Materials
SELECT COUNT(*) FROM material_requests WHERE status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS');

-- Total Questions Consumed
SELECT COUNT(*) FROM material_question_usage;

-- Total Manual Replacements
SELECT COUNT(*) FROM material_question_usage WHERE was_replacement = true;
```

### B. Cycle Breakdown Comparison
```sql
SELECT 
  c.id, 
  c.name, 
  c.is_active as "isActive",
  (SELECT COUNT(*) FROM material_requests r WHERE r.cycle_id = c.id AND r.status IN ('COMPLETED', 'COMPLETED_WITH_WARNINGS')) as "materialsCount",
  (SELECT COUNT(*) FROM material_question_usage q WHERE q.cycle_id = c.id) as "questionsCount",
  (SELECT COUNT(*) FROM syllabus s WHERE s.cycle_id = c.id AND s.is_active = true) as "syllabusCount"
FROM cycles c
ORDER BY c.is_active DESC, c.created_at DESC;
```

### C. Recent History Join
```sql
SELECT r.id, r.week_number as "weekNumber", r.status, r.created_at as "createdAt",
       t.name as "templateName", c.name as "cycleName"
FROM material_requests r
LEFT JOIN cycle_material_templates t ON r.profile_id = t.id
LEFT JOIN cycles c ON r.cycle_id = c.id
ORDER BY r.created_at DESC
LIMIT 5;
```
