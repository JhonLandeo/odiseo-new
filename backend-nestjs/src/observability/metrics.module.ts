import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HttpMetricsMiddleware } from './http-metrics.middleware';
import { MetricsController } from './metrics.controller';
import { MetricsRegistry } from './metrics.registry';

/**
 * Prometheus metrics: default Node.js process metrics plus an HTTP request
 * duration histogram, exposed at `GET /metrics` (see metrics.controller.ts
 * for why that route sits outside the `/api` prefix).
 */
@Module({
  controllers: [MetricsController],
  providers: [MetricsRegistry, HttpMetricsMiddleware],
})
export class MetricsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpMetricsMiddleware).forRoutes('*');
  }
}
