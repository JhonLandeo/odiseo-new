# API Contract: Quick Onboarding

This document defines the REST endpoints for tracking onboarding state and seeding/purging demo data.

---

## 1. Get Onboarding Progress
Retrieve the current onboarding status and completed tasks for the active tenant.

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
    "load_demo_or_create_cycle",
    "create_pdf_template"
  ],
  "isDismissed": false,
  "progressPercentage": 50,
  "availableSteps": [
    {
      "id": "load_demo_or_create_cycle",
      "label": "Cargar datos demo o crear primer ciclo",
      "completed": true
    },
    {
      "id": "create_pdf_template",
      "label": "Configurar plantilla de diseño PDF",
      "completed": true
    },
    {
      "id": "setup_syllabus",
      "label": "Planificar sílabo de un curso",
      "completed": false
    },
    {
      "id": "generate_material",
      "label": "Generar primer material académico",
      "completed": false
    }
  ]
}
```

---

## 2. Seed Demo Data
Populates the tenant schema with placeholder records (Cycle, Syllabus, Design Template) to allow testing.

* **URL**: `/api/v1/onboarding/seed-demo`
* **Method**: `POST`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`

### Success Response
* **Code**: `201 Created`
* **Content**:
```json
{
  "message": "Datos de demostración cargados exitosamente.",
  "cycleId": "0e2f5b82-aa31-482f-8703-e89c67bc2f21",
  "stepsCompleted": [
    "load_demo_or_create_cycle"
  ]
}
```

### Error Response (Already Seeded)
* **Code**: `400 Bad Request`
* **Content**:
```json
{
  "statusCode": 400,
  "message": "No se pueden cargar datos de demostración si ya existen ciclos registrados en la institución."
}
```

---

## 3. Clear Demo Data
Deletes all records where `is_demo = true` and resets steps.

* **URL**: `/api/v1/onboarding/clear-demo`
* **Method**: `POST`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`

### Success Response
* **Code**: `200 OK`
* **Content**:
```json
{
  "message": "Datos de demostración eliminados. El progreso de onboarding ha sido reiniciado."
}
```

---

## 4. Dismiss Onboarding Widget
Dismisses the onboarding checklist widget permanently.

* **URL**: `/api/v1/onboarding/dismiss`
* **Method**: `PATCH`
* **Headers**:
  * `x-subdomain`: `[tenant-slug]`
  * `Authorization`: `Bearer [jwt-token]`
* **Body**:
```json
{
  "isDismissed": true
}
```

### Success Response
* **Code**: `200 OK`
* **Content**:
```json
{
  "isDismissed": true
}
```
