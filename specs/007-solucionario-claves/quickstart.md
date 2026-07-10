# Quickstart & Verification Guide: Solucionario y Claves

Este documento provee una guía rápida para validar de extremo a extremo que la generación del solucionario y claves funcione de forma asíncrona y visualmente consistente.

---

## 1. Prerrequisitos de Verificación

Asegurar que los servidores de desarrollo estén activos en la terminal:
- **Backend:** `pnpm run start:dev` en `backend-nestjs`
- **Frontend:** `pnpm dev` en `frontend-vue`
- **Base de datos seeded:** Asegurar haber corrido `pnpm run seed:dev` (o equivalente a `seed-dev.ts`) para tener datos de prueba en la base de datos de `flat_questions`.

---

## 2. Flujo de Validación Manual

### Paso 1: Generación de Material
1. Inicia sesión en la plataforma en `http://colegio.localhost:3001/login` con las credenciales de administrador provistas en el seed de desarrollo.
2. Ve a la sección **Materiales** y haz clic en **Generar Material**.
3. Selecciona un ciclo académico, una semana y selecciona al menos dos cursos de la matriz (ej. Aritmética y Álgebra).
4. Elige un diseño de plantilla y haz clic en **Generar**.
5. Espera a que el Toast notifique que la generación ha completado en segundo plano.

### Paso 2: Descarga de Archivos de Curso Independiente
1. Abre el detalle del material generado haciendo clic en su tarjeta en el tablero.
2. Despliega el panel de **Cursos y Archivos** ("Ver Cursos & PDFs").
3. Para cada curso listado, verifica que aparezcan tres botones independientes de descarga con sus respectivos tooltips o iconos:
   - **Icono Descarga Estándar:** Descarga el examen limpio de estudiante. Verifica que no existan respuestas resaltadas ni cuadro de claves al final.
   - **Icono Llave (Claves):** Descarga el material que posee únicamente una tabla resumen de claves (`Pregunta | Respuesta`) al final de la sección del curso.
   - **Icono Birrete/Sombrero (Solucionario):** Descarga el solucionario detallado. Verifica que las alternativas correctas estén resaltadas (color de fondo verde o borde distintivo) y que el bloque de resolución detallada aparezca abajo de cada pregunta.

### Paso 3: Descarga Combinada
1. En la parte inferior de la lista de cursos en el modal, haz clic en cada una de las opciones de descarga combinada:
   - **Descargar PDF Combinado (Estudiante)**
   - **Descargar PDF Combinado (Claves)**
   - **Descargar PDF Combinado (Solucionarios)**
2. Abre los PDFs resultantes y valida que las páginas de los cursos se unan adecuadamente respetando el formato elegido.
