# API Contract: Quick Onboarding

This document defines the REST endpoints for reading onboarding state and dismissing/resetting the onboarding tour for the active tenant.

> The tour state is a single tenant-scoped flag (a singleton row); it is not
> per-user. Step completion is not persisted — it is derived from the real
> tenant tables on every request.

---

## 1. Get Onboarding Progress
Retrieve the current onboarding status and derived step completion for the active tenant.

* **URL**: `/api/v1/onboarding/progress`
* **Method**: `GET`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`

### Success Response
* **Code**: `200 OK`
* **Content**:
```json
{
  "stepsCompleted": [
    "create_cycle",
    "create_pdf_template"
  ],
  "isDismissed": false,
  "progressPercentage": 50,
  "availableSteps": [
    {
      "id": "create_cycle",
      "label": "Crear Ciclo",
      "completed": true
    },
    {
      "id": "create_pdf_template",
      "label": "Crear Plantilla PDF",
      "completed": true
    },
    {
      "id": "setup_syllabus",
      "label": "Configurar Syllabus",
      "completed": false
    },
    {
      "id": "generate_material",
      "label": "Generar Material",
      "completed": false
    }
  ]
}
```

---

## 2. Dismiss Onboarding Tour
Dismisses the onboarding tour for the tenant (sets the singleton flag to dismissed).

* **URL**: `/api/v1/onboarding/dismiss`
* **Method**: `PATCH`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`
* **Body**: _none_

### Success Response
* **Code**: `200 OK`
* **Content**:
```json
{
  "success": true
}
```

---

## 3. Reset Onboarding Tour
Re-enables the onboarding tour for the tenant (clears the dismissed flag).

* **URL**: `/api/v1/onboarding/reset`
* **Method**: `PATCH`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`
* **Body**: _none_

### Success Response
* **Code**: `200 OK`
* **Content**:
```json
{
  "success": true
}
```

---

## Removed endpoints

`POST /api/v1/onboarding/seed-demo` and `POST /api/v1/onboarding/clear-demo`
were **removed** (commit `5aeb17e`, "remove demo data functionality") and are
no longer implemented. They are documented here only to note their removal.
