import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { MetricsRegistry } from './metrics.registry';

/**
 * `GET /metrics` — Prometheus text-exposition format.
 *
 * Reachable at the bare (non-`/api`-prefixed) path, the same way `/queues`
 * is: both are excluded from `setGlobalPrefix` in main.ts, because a
 * Prometheus scrape config defaults to `metrics_path: /metrics` and
 * repointing it per-deploy buys nothing here.
 *
 * @Public() exempts it from the global JwtAuthGuard/PermissionsGuard chain —
 * the same mechanism HealthController uses — since a scraper carries no
 * tenant JWT. It is also listed in TenantMiddleware's `publicPaths` so it
 * never gets forced through subdomain/tenant resolution. Nothing here is
 * tenant-scoped or carries request/user data: it is process-wide counters
 * and histograms. One caveat: `collectDefaultMetrics()` (in
 * `metrics.registry.ts`) DOES include the exact running Node.js version as a
 * label on `nodejs_version_info`, unauthenticated — a deliberate, common
 * tradeoff (it's genuinely useful for tracking version drift across a
 * fleet), not an oversight, but worth knowing if this endpoint is ever
 * exposed beyond an internal scrape network.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsRegistry) {}

  @Get()
  @Public()
  async getMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.send(await this.metrics.registry.metrics());
  }
}
