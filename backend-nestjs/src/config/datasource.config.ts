import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno (para cuando se ejecute desde CLI)
config({ path: join(__dirname, '../../.env') });

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'odiseo',
  // Importante: Solo incluimos las entidades públicas del sistema (SaaS) y Catálogos para que no genere tablas tenant_ en public
  entities: [
    join(__dirname, '../tenants/entities/tenant.entity{.ts,.js}'),
    join(
      __dirname,
      '../admin/subscriptions/entities/subscription-plan.entity{.ts,.js}',
    ),
    join(__dirname, '../catalogs/entities/course.entity{.ts,.js}'),
    join(__dirname, '../catalogs/entities/topic.entity{.ts,.js}'),
    join(__dirname, '../catalogs/entities/subtopic.entity{.ts,.js}'),
    join(__dirname, '../catalogs/entities/catalog-sync-state.entity{.ts,.js}'),
    join(
      __dirname,
      '../catalogs/entities/topic-id-space-reconciliation-state.entity{.ts,.js}',
    ),
    join(
      __dirname,
      '../question-bank/entities/question-level-reconciliation-state.entity{.ts,.js}',
    ),
  ],
  // Directorio para crear migraciones.
  //
  // Matches only files starting with a timestamp, the naming every migration
  // follows. A bare `*` also picks up anything else left in the directory —
  // a compiled spec, for instance — and TypeORM then loads and executes it as
  // a migration, which fails the whole run with an error naming neither the
  // file nor the reason.
  migrations: [join(__dirname, '../database/migrations/[0-9]*{.ts,.js}')],
  synchronize: false,
  // Pool + timeout options, kept in sync with database.module.ts.
  //
  // `statement_timeout` aborts any single query exceeding the limit on that
  // connection, so the default is generous (30s) and must stay above the
  // slowest legitimate migration/DDL. `max` bounds this process's connections;
  // DB_POOL_MAX * replicas must remain under Postgres `max_connections`.
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    connectionTimeoutMillis: parseInt(
      process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '10000',
      10,
    ),
    idleTimeoutMillis: parseInt(
      process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000',
      10,
    ),
    statement_timeout: parseInt(
      process.env.DB_STATEMENT_TIMEOUT_MS || '30000',
      10,
    ),
  },
};

export default new DataSource(dataSourceOptions);
