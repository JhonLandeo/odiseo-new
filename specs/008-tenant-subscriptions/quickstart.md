# Phase 1: Quickstart & Validation Guide

## Propósito
Esta guía provee los pasos para probar end-to-end la creación de un plan de suscripción, el registro de un tenant y la validación de sus límites y dashboard en el ambiente local.

## Prerrequisitos
- Base de datos PostgreSQL en ejecución (`docker-compose up -d db`).
- Entorno backend iniciado (`npm run start:dev` en `backend-nestjs`).
- Entorno frontend iniciado (`npm run dev` en `frontend-vue`).

## Escenario de Validación End-to-End

### 1. Crear Plan de Suscripción Básico
Ejecutar desde terminal (simulando API):
```bash
curl -X POST http://localhost:3000/api/v1/admin/subscriptions/plans \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>" \
  -d '{
    "name": "Básico",
    "price": 0,
    "max_users": 5,
    "max_pdf_pages_per_month": 100,
    "max_questions_per_month": 500
  }'
```
**Expectativa:** Retorna `201 Created` con el ID del plan.

### 2. Crear Tenant (Empresa)
```bash
curl -X POST http://localhost:3000/api/v1/admin/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Academia Alpha",
    "subdomain": "alpha",
    "subscription_plan_id": "<ID_DEL_PLAN_ANTERIOR>"
  }'
```
**Expectativa:**
1. Retorna `201 Created`.
2. Validar en Base de Datos: Ingresar a PostgreSQL y verificar que el esquema `alpha` se ha creado automáticamente (`\dn`).

### 3. Verificar Dashboard y Métricas (Vacías inicialmente)
```bash
curl -X GET "http://localhost:3000/api/v1/admin/dashboard/metrics?tenant_id=<TENANT_ID>" \
  -H "Authorization: Bearer <SUPER_ADMIN_TOKEN>"
```
**Expectativa:**
Retorna contadores en `0` (pdf_pages, questions_used, storage_mb).

### 4. Simulación de Periodo de Gracia (Soft-limit)
Ejecutar PATCH para setear el status del tenant a `GRACE_PERIOD`.
Validar ingresando al frontend con las credenciales de un usuario del tenant, donde se debería observar un cintillo o alerta de "Periodo de Gracia" sin bloquear el uso regular de la plataforma.
