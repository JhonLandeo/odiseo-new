import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { MetricsRegistry } from './metrics.registry';

/**
 * Records one `http_request_duration_seconds` observation per completed
 * request.
 *
 * This is intentionally a separate, tiny timer rather than reusing
 * pino-http's own `responseTime` — that measurement feeds pino-http's
 * structured log line (a different sink, JSON logs), not a `prom-client`
 * histogram, and coupling the metrics module to the logging module's request
 * hook would cross this module's boundary for a two-line timer.
 *
 * `route` is read from `req.route` on the `finish` event (after Express has
 * matched the route), so labels stay low-cardinality (`/materials/:id`, not
 * `/materials/<uuid>` per request). Requests that never matched a route
 * (404s, and anything rejected by middleware before routing) fall back to the
 * fixed label `unmatched` instead of the raw path, for the same reason —
 * otherwise arbitrary/garbage request paths would grow the label set
 * unbounded.
 *
 * `method` is allowlisted the same way: this middleware runs on every request
 * via `forRoutes('*')`, BEFORE any auth guard and with no rate limiting in
 * front of it, so an unauthenticated caller controls the raw `req.method`
 * value directly (Node's HTTP parser accepts arbitrary extension-method
 * tokens, not just the standard verbs). `prom-client` keeps one persistent
 * time series per unique label combination forever, so passing that value
 * through unchecked would let anyone grow this process's memory unboundedly
 * just by sending requests with distinct method strings.
 */
const KNOWN_HTTP_METHODS = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsRegistry) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
      const routePath = req.route?.path as string | undefined;
      const route = routePath ? `${req.baseUrl}${routePath}` : 'unmatched';
      const method = KNOWN_HTTP_METHODS.has(req.method) ? req.method : 'OTHER';

      this.metrics.httpRequestDuration.observe(
        {
          method,
          route,
          status_code: String(res.statusCode),
        },
        durationSeconds,
      );
    });

    next();
  }
}
