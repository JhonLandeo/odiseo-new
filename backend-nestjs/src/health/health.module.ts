import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './redis-health.indicator';

/**
 * Health probes (liveness + readiness).
 *
 * TerminusModule provides HealthCheckService and TypeOrmHealthIndicator (the
 * latter pings the default TypeORM connection provided globally by
 * DatabaseModule). RedisHealthIndicator owns its own bounded ioredis client.
 */
@Module({
  imports: [TerminusModule, ConfigModule],
  controllers: [HealthController],
  providers: [RedisHealthIndicator],
})
export class HealthModule {}
