# API & WebSocket Contracts: Solucionario y Claves

Este documento define la estructura de los contratos de comunicación (API REST y WebSocket) actualizados para la integración del solucionario y claves.

---

## 1. REST API

### `GET /v1/materials/:id/history`

Retorna la lista de intentos de generación del material. Se expande el objeto de respuesta para incluir los enlaces de claves y solucionario de cada curso.

#### Response Schema (Fragmento de `courses`):

```json
{
  "id": "e30b05b4-d50d-4007-a8bf-5ab440072b22",
  "status": "COMPLETED",
  "courses": [
    {
      "courseId": "87c4f42e-13c5-4309-8472-a1f94532b21c",
      "status": "COMPLETED",
      "downloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Material_Estudiante.pdf",
      "keyDownloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Material_Claves.pdf",
      "solutionDownloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Material_Solucionario.pdf"
    }
  ],
  "mergedDownloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Completo_Estudiante.pdf",
  "mergedKeyDownloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Completo_Claves.pdf",
  "mergedSolutionDownloadUrl": "https://s3.amazonaws.com/bucket/materials/tenant_1/cycle_1/req_1/Completo_Solucionario.pdf"
}
```

---

## 2. WebSocket Notifications

No se requieren nuevos eventos WebSocket de mensajería. Se reutiliza la infraestructura de eventos de completitud de materiales, y la carga útil del evento existente `material.generation.completed` se actualiza para retornar los enlaces combinados.

### Event Payload: `material.generation.completed`

```json
{
  "event": "material.generation.completed",
  "data": {
    "job_id": "e30b05b4-d50d-4007-a8bf-5ab440072b22",
    "material_type": "EXAMEN",
    "status": "success",
    "download_url": "https://s3.amazonaws.com/bucket/.../Completo_Estudiante.pdf",
    "key_download_url": "https://s3.amazonaws.com/bucket/.../Completo_Claves.pdf",
    "solution_download_url": "https://s3.amazonaws.com/bucket/.../Completo_Solucionario.pdf"
  }
}
```
