# Contract: API - Generación de Material

Endpoint REST expuesto por el SaaS B2B (NestJS) para solicitar la generación de un material.

**Endpoint**: `POST /api/v1/materials/generate`
**Auth**: Bearer Token (Admin/Coordinator roles)

## Request Payload

```json
{
  "profile_id": "uuid-del-perfil-de-material",
  "week_number": 5,
  "requires_review": true,
  "courses": [
    {
      "course_id": "math-101"
    }
  ]
}
```

## Response Payload (202 Accepted)

```json
{
  "message": "Solicitud de generación encolada exitosamente",
  "data": {
    "material_request_id": "uuid-de-la-solicitud",
    "status": "PENDING",
    "estimated_completion": "60s"
  }
}
```

## Contrato Interno: SQS Message Payload (NestJS -> Worker FastAPI)

```json
{
  "material_request_id": "uuid-de-la-solicitud",
  "tenant_id": "tenant-xyz",
  "cycle_id": "uuid-del-ciclo",
  "week_number": 5,
  "requires_review": true,
  "material_type": "BALOTARIO",
  "distributions": [
    {
      "course_id": "math-101",
      "topics": [
        {
          "topic_id": "t1",
          "subtopic_id": "st1",
          "quantity": 5
        }
      ],
      "exclude_question_ids": ["q1", "q2", "q3"] // Provisto por módulo de Trazabilidad
    }
  ]
}
```
