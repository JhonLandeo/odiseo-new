import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public } from '../common/decorators/public.decorator';
import { RedisHealthIndicator } from './redis-health.indicator';

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
   * Postgres default connection and Redis are both reachable; terminus returns
   * 503 when any indicator reports down.
   */
  @Get('ready')
  @Public()
  @HealthCheck()
  readiness() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.isHealthy('redis'),
    ]);
  }
}
