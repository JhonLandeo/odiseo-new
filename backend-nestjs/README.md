# Odiseo — Backend (NestJS)

Backend SaaS multi-tenant: NestJS + TypeORM + PostgreSQL (un schema por
tenant), Redis/BullMQ para colas y caché, y una conexión de solo lectura a
una base de datos externa de banco de preguntas.

## Requisitos previos

- Node.js + npm
- PostgreSQL accesible en `DB_HOST`/`DB_PORT`
- Redis accesible en `REDIS_HOST`/`REDIS_PORT` — opcional para levantar el
  proyecto en desarrollo, pero obligatorio para todo lo que pasa por una cola
  (aprovisionamiento de tenants, generación de materiales/PDF) o por la
  caché de permisos

## Variables de entorno

Copiá `.env.example` a `.env`. `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER` y `DB_PASS` son obligatorias en todo entorno; el resto
(credenciales de AWS/GCS, `REDIS_HOST`/`PORT`, `BASE_DOMAIN`,
`COOKIE_DOMAIN`, `WORKER_WEBHOOK_SECRET`, `PROCESS_ROLE`) solo es
obligatorio cuando `NODE_ENV=production`, y opcional en cualquier otro caso.
`src/config/env.validation.ts` es la fuente de verdad, fail-fast: la
aplicación se niega a arrancar si falta algo obligatorio.

## Configuración de la base de datos — ¿hay que correr un seed?

Sí, pero no es un paso aparte: **correr las migraciones ES el seed.**

```bash
npm run migration:run
```

Esto aplica todas las migraciones del schema `public`, y con ellas la
migración `SeedSuperAdmin`, que:

- crea el tenant propio de la plataforma (`companies.subdomain = 'odiseo'`)
- aprovisiona el schema de ese tenant con el mismo runner de
  `TENANT_MIGRATIONS` que usa cualquier tenant real, así que siempre termina
  con el set completo y actual de tablas — nunca una copia parcial a mano
- crea un usuario Super Admin para ese tenant

Como esta migración corre una sola vez (TypeORM la registra), **la
contraseña solo existe en ese momento**:

- seteá `SEED_SUPERADMIN_PASSWORD` (y opcionalmente `SEED_SUPERADMIN_EMAIL`,
  por defecto `superadmin@odiseo.com`) en el `.env` antes de la primera
  corrida, **o**
- dejalo sin setear y leé la contraseña generada en la salida de la
  consola — se imprime una sola vez y no es recuperable de la base de datos
  después.

En producción, `SEED_SUPERADMIN_PASSWORD` es obligatoria — la migración se
niega a correr sin ella en vez de sembrar una contraseña conocida o por
defecto en una cuenta con todos los permisos de la plataforma. En cualquier
caso, ese primer login está forzado a cambiar la contraseña
(`force_password_reset`).

Dos comandos relacionados:

- `npm run migration:run:tenants` — vuelve a aplicar `TENANT_MIGRATIONS`
  sobre cada schema de tenant *ya existente*. Corré esto después de agregar
  una migración de tenant nueva, y en cada deploy.
- Cualquier tenant aparte del de plataforma se crea a través de la API de
  admin (`POST /v1/admin/tenants`) como Super Admin, no con un script. El
  aprovisionamiento es asíncrono (BullMQ), así que hacen falta Redis y un
  proceso worker corriendo para que un tenant recién creado termine de
  aprovisionarse.

### Datos opcionales para desarrollo

- `npm run seed:catalogs` — carga cursos/temas/subtemas de prueba (y
  preguntas de relleno) en `public.*`, a partir de los fixtures JSON que ya
  están commiteados en `scripts/data/`. Es solo una comodidad para probar la
  UI localmente: en producción el catálogo se sincroniza desde el Core API,
  y las preguntas reales vienen de una base de datos de banco de preguntas
  **separada**, apuntada por la variable de entorno `DB_QUESTIONS_BASE`
  (`odiseo_pro` si no la seteás — no está hardcodeada, es el valor por
  defecto de `config.get()` en `src/database/database.module.ts`), que este
  repo no crea ni siembra. `DB_QUESTIONS_NAME` está declarada en
  `env.validation.ts` pero ningún código la lee — es una variable muerta,
  no la uses pensando que hace algo. La tabla `public.questions` que escribe
  este script no la lee ningún código de la aplicación — existe solo para
  los datos de prueba de este script.
- `npm run seed:dev` — **destructivo, solo para desarrollo** (se niega a
  correr con `NODE_ENV=production`). Borra todos los schemas de la base de
  datos (`public` y cada tenant) y vuelve a correr las migraciones desde
  cero, lo que regenera el tenant de plataforma y su Super Admin igual que
  en una configuración desde cero. Usalo para resetear una base de datos
  local rota, no para agregar datos a una que ya existe.

## Levantar el proyecto

```bash
# API
npm run start:dev

# Worker de colas — necesario para que los jobs de generación de
# materiales/PDF y de aprovisionamiento de tenants se procesen de verdad;
# sin esto, los requests solo quedan encolados
npm run start:worker:dev
```

`PROCESS_ROLE` es opcional en desarrollo (por defecto ambos roles corren en
el mismo proceso), pero en producción debe setearse explícitamente a `api`
o `worker` — las réplicas de API nunca deben correr también el procesador
de generación de PDFs.

## Tests

```bash
npm run test       # unitarios
npm run test:e2e   # e2e
npm run test:cov   # cobertura
```

## Arquitectura, a grandes rasgos

Los datos viven en tres lugares, no en uno:

- **Schema `public`** — compartido entre todos los tenants: el registro de
  tenants (`companies`), el catálogo académico sincronizado desde el Core
  API (`courses`/`topics`/`subtopics`), y el estado de billing/reconciliación.
- **Un schema por tenant** (`tenant_<companyId>`) — clonado con el mismo DDL
  de `TENANT_MIGRATIONS` para cada empresa: usuarios/roles, ciclos,
  sílabos, materiales, onboarding.
- **Una base de datos externa de solo lectura para el banco de preguntas**
  (nombre configurable vía `DB_QUESTIONS_BASE`, `odiseo_pro` por defecto) —
  accedida únicamente a través de `FlatQuestionsRepository`, la única clase
  autorizada a correr SQL crudo contra ella.
