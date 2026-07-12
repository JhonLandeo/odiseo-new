# Phase 1: Interface Contracts

## Admin API Endpoints (Backend NestJS)

Todos los endpoints asumen el prefijo base `/api/v1/admin` y requieren autenticación de Super Administrador.

### 1. Gestión de Planes de Suscripción
- `GET /subscriptions/plans`
  - Response: `200 OK` Array of `SubscriptionPlan`
- `POST /subscriptions/plans`
  - Body: `{ name: string, price: number, max_users: number, max_pdf_pages_per_month: number, max_questions_per_month: number }`
  - Response: `201 Created`

### 2. Gestión de Tenants
- `GET /tenants`
  - Response: `200 OK` Array of `Tenant`
- `POST /tenants`
  - Body: `{ name: string, subdomain: string, subscription_plan_id: string }`
  - Response: `201 Created`
  - Side effect: Gatilla la creación del esquema en PostgreSQL (ej. `CREATE SCHEMA "tenant_subdomain";`)
- `PATCH /tenants/:id/status`
  - Body: `{ status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD', grace_period_until?: Date }`

### 3. Dashboard de Consumo
- `GET /dashboard/metrics`
  - Query Params: `?tenant_id=UUID&start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
  - Response: `200 OK` 
    ```json
    {
      "active_users": 150,
      "storage_mb": 1024,
      "pdf_pages_generated": 530,
      "questions_used": 12000
    }
    ```
