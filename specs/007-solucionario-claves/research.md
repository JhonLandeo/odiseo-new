# Research & Decisions: Solucionario y Claves

Este documento detalla las decisiones de investigación técnica para implementar la hoja de claves y los solucionarios de los materiales.

---

## 1. Obtención de Respuestas y Explicaciones

* **Decisión:** Obtener la información de alternativas correctas y soluciones paso a paso directamente desde la tabla `odiseo.flat_questions` en la base de datos PostgreSQL local.
* **Justificación:** 
  - La tabla `flat_questions` ya se encuentra sincronizada con el Core API y se utiliza para el listado de preguntas y auditorías de curaduría.
  - Cada fila posee la columna `alternatives` (con la bandera `is_correct` por opción) y `solution` (con arreglos de `diagrammed` y `didi_maths` que contienen las explicaciones de la solución).
  - Consultar de forma local evita latencia y fallas de conexión HTTP de red síncronas entre NestJS y FastAPI en tiempo de compilación del PDF.

---

## 2. Generación del Formato de Claves y Solucionario

* **Decisión:** Reutilizar el motor de renderizado HTML + Playwright implementado en `PdfGeneratorService` con dos modos de renderizado adicionales: `withKeysTable` y `withSolution`.
* **Justificación:** 
  - Playwright es capaz de interpretar con precisión el diseño CSS, fuentes y fórmulas matemáticas complejas.
  - `withSolution` ya está parcialmente soportado en la clase de servicio (`buildHtml`), por lo que solo requiere expandir el flujo del worker para guardar la salida en un archivo S3 diferente.
  - `withKeysTable` agregará dinámicamente un bloque CSS Grid al final del cuerpo HTML del curso, ordenando de forma compacta (ej: 4 columnas de cuadrícula) la correspondencia de número de pregunta y alternativa.

---

## 3. Estrategia de Compilación de PDFs

* **Decisión:** El worker de background procesará las tres compilaciones en la misma ejecución del job.
* **Justificación:**
  - Dado que la consulta a la base de datos de preguntas y recursos de imagen ya se realiza una vez al iniciar la generación de la distribución del curso, es computacionalmente más eficiente compilar los tres PDFs secuencialmente en el mismo job y subirlos a S3.
  - Esto simplifica la gestión del estado (el curso pasa a `COMPLETED` cuando las tres versiones están listas), eliminando la necesidad de colas de procesamiento secundarias complejas.
