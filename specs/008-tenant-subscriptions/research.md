# Phase 0: Research & Architecture Decisions

## Decision 1: Aislamiento de Base de Datos
- **Decision**: Implementar el patrón `Schema-per-tenant` para aislar los datos operativos de cada cliente, manteniendo un esquema `public` para configuraciones globales.
- **Rationale**: Impuesto estrictamente por la *Odiseo Constitution* (Sección VI y VIII). Garantiza seguridad de datos B2B y previene fugas de información, algo inalcanzable con Row-Level Tenancy para la data escolar.
- **Alternatives considered**: Row-Level Tenancy (rechazado por estar explícitamente prohibido en los Antipatrones de la constitución).

## Decision 2: Captura de Métricas de Consumo
- **Decision**: Recopilar métricas de consumo de procesamiento (ej. páginas de PDF, preguntas consumidas) a través de eventos asíncronos publicados por el Worker SQS (Fargate) de generación de materiales.
- **Rationale**: Cumple el principio de *Asincronía Extrema*. Previene que el backend web de NestJS se bloquee contando registros o páginas en hilos de petición.
- **Alternatives considered**: Actualización síncrona de métricas al momento de solicitar generación (rechazado, produce latencia y no corresponde al volumen real finalmente producido).

## Decision 3: Control de Límites y Pagos
- **Decision**: Aplicar Soft-limits con bloqueo diferido mediante un flag de `grace_period_until` en la tabla tenant, controlado por validadores globales (Guards) de NestJS en operaciones de mutación.
- **Rationale**: Decisión del usuario acordada en la especificación, para priorizar la continuidad operativa frente al bloqueo duro. Los pagos se mantendrán offline, por ende, el estado del pago es sólo un campo lógico.
- **Alternatives considered**: Integración completa con Stripe (rechazada por el usuario a favor de una gestión manual).
