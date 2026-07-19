import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Public } from '../common/decorators/public.decorator';
import { RedisHealthIndicator } from './redis-health.indicator';

/** Matches RedisHealthIndicator's PING_TIMEOUT_MS so no readiness dependency
 * can stall the probe longer than any other. */
const QUESTIONS_DB_PING_TIMEOUT_MS = 2000;

/**
 * Liveness and readiness probes.
 *
 * Both routes are @Public(): they must answer before (and without) any session
 * so an orchestrator can probe them with no JWT. @Public() also makes them exit
 * the deny-by-default PermissionsGuard via its rule (1) — a public route is
 * allowed outright — and they carry no @RequirePermissions. TenantMiddleware
 * would otherwise 400 them (no subdomain), so `/health` is exempted in its
 * publicPaths list.
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    @InjectDataSource('questionsConnection')
    private readonly questionsDataSource: DataSource,
  ) {}

  /**
   * Liveness: "is the process up and the event loop responsive?". No dependency
   * checks — it must stay 200 even while Postgres or Redis are down, otherwise
   * an orchestrator would kill and restart a process that is perfectly capable
   * of serving traffic once its dependencies recover.
   */
  @Get()
  @Public()
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  /**
   * Readiness: "should this instance receive traffic right now?". Verifies the
   * Postgres default connection, the separate questions-bank connection, and
   * Redis are all reachable; terminus returns 503 when any indicator reports
   * down. The questions-bank check matters on its own: it is a physically
   * separate datasource from the default connection (see database.module.ts),
   * so the default connection being up says nothing about it, and every
   * question-bank-dependent route (materials generation, curation, previews)
   * would otherwise 500 behind a readiness probe still reporting 200.
   */
  @Get('ready')
  @Public()
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () =>
        this.db.pingCheck('questionsDatabase', {
          connection: this.questionsDataSource,
          timeout: QUESTIONS_DB_PING_TIMEOUT_MS,
        }),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
