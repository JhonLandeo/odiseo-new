# Data Model Updates: Solucionario y Claves

Este documento detalla las modificaciones al modelo de datos para soportar el almacenamiento de enlaces y estados de los solucionarios y claves de respuestas.

---

## Esquemas de Base de Datos Multi-tenant (`tenant_*`)

Las siguientes modificaciones se aplicarán a cada esquema aislado de tenant.

### 1. Tabla `material_request_courses`

Se agregan dos columnas para almacenar las URLs de los PDFs alternativos generados en el almacenamiento de objetos (GCS/S3):

```sql
ALTER TABLE tenant_xx.material_request_courses 
  ADD COLUMN key_download_url VARCHAR(2048) NULL,
  ADD COLUMN solution_download_url VARCHAR(2048) NULL;
```

* **`key_download_url`**: Ruta absoluta o prefirmada del PDF del material que contiene la tabla de claves al final.
* **`solution_download_url`**: Ruta absoluta o prefirmada del PDF del material que incluye el solucionario paso a paso de cada pregunta.

---

### 2. Tabla `material_requests` (Tabla de Solicitud Padre)

Se agregan columnas para almacenar el PDF combinado (de todos los cursos del material) en sus variantes de claves y solucionario:

```sql
ALTER TABLE tenant_xx.material_requests
  ADD COLUMN merged_key_download_url VARCHAR(2048) NULL,
  ADD COLUMN merged_solution_download_url VARCHAR(2048) NULL;
```

---

## Mapeo en Entidades TypeORM (NestJS)

### Entidad `MaterialRequestCourse`
- `keyDownloadUrl`: Mapeado a la columna `key_download_url`.
- `solutionDownloadUrl`: Mapeado a la columna `solution_download_url`.

### Entidad `MaterialRequest`
- `mergedKeyDownloadUrl`: Mapeado a la columna `merged_key_download_url`.
- `mergedSolutionDownloadUrl`: Mapeado a la columna `merged_solution_download_url`.
