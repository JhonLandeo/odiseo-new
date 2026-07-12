# Phase 1: Data Model

Las siguientes entidades residirán en el esquema `public` de la base de datos PostgreSQL, ya que representan la capa global del SaaS B2B.

## 1. Entity: `subscription_plan`
Define el catálogo de planes comerciales.
- `id` (UUID, PK)
- `name` (VARCHAR, ej. "Básico", "Pro")
- `price` (DECIMAL)
- `max_users` (INT)
- `max_pdf_pages_per_month` (INT)
- `max_questions_per_month` (INT)
- `created_at` / `updated_at` (TIMESTAMP)

## 2. Entity: `tenant`
Representa a una empresa operadora en el B2B.
- `id` (UUID, PK)
- `name` (VARCHAR, nombre comercial)
- `subdomain` (VARCHAR, UNIQUE, índice)
- `subscription_plan_id` (UUID, FK a `subscription_plan`)
- `status` (ENUM: 'ACTIVE', 'SUSPENDED', 'GRACE_PERIOD')
- `grace_period_until` (TIMESTAMP, NULL)
- `db_schema_name` (VARCHAR, UNIQUE)
- `created_at` / `updated_at` (TIMESTAMP)

## 3. Entity: `consumption_metric`
Métricas consolidadas para uso analítico.
- `id` (UUID, PK)
- `tenant_id` (UUID, FK a `tenant`)
- `metric_type` (VARCHAR, ej. 'pdf_pages', 'questions_used', 'active_users', 'storage_mb')
- `value` (BIGINT o DECIMAL)
- `period_start` (DATE)
- `period_end` (DATE)
- `created_at` (TIMESTAMP)
