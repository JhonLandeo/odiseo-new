import { Injectable } from '@nestjs/common';
import { Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Owns a dedicated `prom-client` `Registry` instance rather than using the
 * library's global default registry. A NestJS provider is a singleton per
 * `TestingModule.compile()` / app instance, so a fresh `Registry` per
 * instance means repeated module compilation in tests (or, in principle, a
 * hot-reloaded dev process) never hits prom-client's
 * "metric already registered" error from re-declaring the same metric name
 * against one shared process-wide registry.
 */
@Injectable()
export class MetricsRegistry {
  readonly registry = new Registry();

  readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds, labeled by method/route/status_code.',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    registers: [this.registry],
  });

  constructor() {
    // Standard Node.js process metrics: event loop lag, heap, GC, fd count,
    // etc. Scoped to this instance's registry for the same reason as above.
    collectDefaultMetrics({ register: this.registry });
  }
}
