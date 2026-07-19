# API Contract: Quick Onboarding

This document defines the REST endpoints for reading onboarding state and dismissing/resetting the onboarding tour for the active tenant.

> The tour dismissal flag is PER-USER: each user keeps the tour until they
> dismiss it themselves (the row is keyed on `user_id`). The user is taken from
> the authenticated session (JWT). Step completion, by contrast, is not
> persisted and is TENANT-level — it is derived from the real tenant tables on
> every request, so it is identical for every user of the tenant.

---

## 1. Get Onboarding Progress
Retrieve the calling user's dismissal state and the tenant's derived step completion.

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
Dismisses the onboarding tour for the calling user only (sets their `is_dismissed` flag).

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
Re-enables the onboarding tour for the calling user only (clears their dismissed flag).

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
