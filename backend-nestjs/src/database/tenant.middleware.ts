import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ClsService } from 'nestjs-cls';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  /**
   * Paths that must NOT resolve a tenant.
   *
   * This list is deliberately SPECIFIC, one entry per platform-level route,
   * instead of the blanket '/api/v1/admin' prefix it used to carry. That
   * blanket entry exempted every controller under /api/v1/admin, including the
   * genuinely tenant-scoped ones (roles, users, user-roles): they never got a
   * tenantSchema or companyId in CLS, so they were broken at runtime AND
   * invisible to the cross-tenant check in JwtAuthGuard, which reads "no
   * companyId in CLS" as "platform route, allow".
   *
   * Matching is `requestPath.startsWith(p)`, so every entry here also exempts
   * everything nested beneath it — keep entries as narrow as the route allows.
   *
   * A new admin controller that touches a tenant schema (or reads
   * cls.get('companyId')) MUST NOT be added here. Being absent from this list
   * is the safe default: the request resolves its tenant and the guard can see
   * it. Only add a path that takes an explicit tenant id in its payload/URL, or
   * touches no tenant schema at all.
   */
  private readonly publicPaths = [
    // Public branding lookup, used before any tenant session exists.
    '/api/v1/tenants/branding',
    '/v1/tenants/branding',
    // Platform tenant administration; the tenant is an explicit :tenantId
    // parameter. Also covers /v1/admin/tenants/:tenantId/admins.
    '/api/v1/admin/tenants',
    '/v1/admin/tenants',
    // Platform subscription administration; operates on public-schema data.
    '/api/v1/admin/subscriptions',
    '/v1/admin/subscriptions',
    // Platform dashboard; takes the tenant as an explicit tenant_id query param.
    '/api/v1/admin/dashboard',
    '/v1/admin/dashboard',
    // Returns a static permission catalog constant; no database access at all.
    '/api/v1/admin/permissions',
    '/v1/admin/permissions',
    // Bull board UI, outside the versioned API entirely.
    '/queues',
    // Liveness/readiness probes. They must answer before any tenant session
    // exists (an orchestrator probes with no subdomain), and the readiness
    // check does its own dependency pings — it never touches a tenant schema.
    // Both prefix variants are listed because middleware may see the path with
    // or without the global 'api' prefix depending on how it is mounted.
    '/api/health',
    '/health',
  ];

  constructor(
    private readonly cls: ClsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // Extract subdomain from x-subdomain header or from host
    const host = req.headers.host || '';
    let subdomain = req.headers['x-subdomain'] as string;

    if (!subdomain && host) {
      const parts = host.split('.');
      if (
        parts.length >= 2 &&
        parts[0] !== 'www' &&
        !parts[0].startsWith('localhost')
      ) {
        subdomain = parts[0];
      }
    }

    // Store subdomain in CLS for all routes
    this.cls.set('subdomain', subdomain || null);

    // For public paths, skip tenant resolution
    const requestPath = req.baseUrl + req.path;
    if (this.publicPaths.some((p) => requestPath.startsWith(p))) {
      next();
      return;
    }

    // If no subdomain, block the request (EC-002)
    if (!subdomain) {
      throw new BadRequestException(
        'Unable to resolve subdomain. Ensure you are accessing via a valid tenant URL.',
      );
    }

    // Resolve subdomain → company → tenantSchema. The lookup is served from
    // the short-TTL Redis cache in TenantsService (filtering isActive: true),
    // falling through to Postgres on any miss or cache failure. Company
    // mutations invalidate the cached row, so a suspension is enforced on the
    // next request and the TTL only bounds the fallback case.
    const company = await this.tenantsService.findBySubdomain(subdomain);

    if (!company) {
      throw new BadRequestException(
        `The subdomain '${subdomain}' does not correspond to any registered company.`,
      );
    }

    // Enforce subscription status: a SUSPENDED company must not resolve to its
    // tenant context, even if isActive is still true. GRACE_PERIOD stays allowed.
    if (company.status === 'SUSPENDED') {
      throw new ForbiddenException(
        `The company '${subdomain}' is currently suspended. Please contact support.`,
      );
    }

    // Set resolved tenant data in CLS
    const tenantSchema = `tenant_${company.id}`;
    this.cls.set('tenantSchema', tenantSchema);
    this.cls.set('companyId', company.id);

    next();
  }
}
