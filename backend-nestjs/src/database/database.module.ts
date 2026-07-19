import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TenantService } from './tenant.service';
import { SchemaService } from './schema.service';
import { TenantMigrationService } from './tenant-migration.service';
import { Company } from '../tenants/entities/tenant.entity';
import { Question } from '../question-bank/entities/question.entity';
import { Alternative } from '../question-bank/entities/alternative.entity';

/**
 * node-postgres pool + connection options shared by every TypeORM root.
 *
 * Without this, both roots fell back to the pg default pool max of 10, shared
 * across the API, cron and worker processes, with no timeout to recover a
 * connection pinned by a slow query.
 *
 * Pool sizing: DB_POOL_MAX bounds the connections a SINGLE process opens. The
 * real ceiling is Postgres `max_connections` (default 100). Keep
 * `DB_POOL_MAX * (number of running processes/replicas)` comfortably under it,
 * leaving headroom for migrations, psql sessions and superuser slots.
 *
 * `statement_timeout` is a per-connection Postgres setting that aborts ANY
 * single query running longer than the limit. It applies to every query on the
 * connection, so the default is deliberately GENEROUS (30s) — it must stay
 * above the slowest LEGITIMATE query (cron roll-ups, provisioning DDL, large
 * PDF-data reads). Its purpose is only to stop a runaway query from pinning a
 * pooled connection forever, not to bound normal work. Tune via
 * DB_STATEMENT_TIMEOUT_MS and never set it below the slowest known good query.
 */
function buildPoolExtra(config: ConfigService): Record<string, unknown> {
  return {
    // Pool options (node-postgres)
    max: config.get<number>('DB_POOL_MAX', 20),
    connectionTimeoutMillis: config.get<number>(
      'DB_POOL_CONNECTION_TIMEOUT_MS',
      10000,
    ),
    idleTimeoutMillis: config.get<number>('DB_POOL_IDLE_TIMEOUT_MS', 30000),
    // Connection param forwarded to Postgres by node-postgres.
    statement_timeout: config.get<number>('DB_STATEMENT_TIMEOUT_MS', 30000),
  };
}

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbName = config.get<string>('DB_NAME', 'odiseo');
        const dbUser = config.get<string>('DB_USER', 'postgres');
        console.log(
          `📡 TypeORM Default Connection Details: host=${config.get('DB_HOST')}, port=${config.get('DB_PORT')}, database=${dbName}, username=${dbUser}`,
        );
        return {
          type: 'postgres',
          host: config.get<string>('DB_HOST', 'localhost'),
          port: config.get<number>('DB_PORT', 5432),
          username: dbUser,
          password: config.get<string>('DB_PASS', 'postgres'),
          database: dbName,
          autoLoadEntities: true,
          synchronize: false,
          logging: ['error', 'warn'],
          extra: buildPoolExtra(config),
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      name: 'questionsConnection',
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASS', 'postgres'),
        database: config.get<string>('DB_QUESTIONS_BASE', 'odiseo_pro'),
        entities: [Question, Alternative],
        synchronize: false,
        logging: ['error', 'warn'],
        extra: buildPoolExtra(config),
      }),
    }),
    // Company repository exported for global consumers (provisioning listener,
    // admin services). TenantMiddleware itself resolves companies through the
    // cached TenantsService lookup.
    TypeOrmModule.forFeature([Company]),
  ],
  providers: [TenantService, SchemaService, TenantMigrationService],
  exports: [
    TenantService,
    SchemaService,
    TenantMigrationService,
    TypeOrmModule,
  ],
})
export class DatabaseModule {}
