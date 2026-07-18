import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { PERMISSIONS } from '../../roles/constants/permissions.constant';

/**
 * Binds the `:tenantId` route parameter to the authenticated caller.
 *
 * The tenant-admin routes live under `/v1/admin/tenants/:tenantId/admins` and
 * operate directly on schema `tenant_${tenantId}`. That prefix matches
 * TenantMiddleware.publicPaths, so no tenant is resolved into CLS and
 * JwtAuthGuard's cross-tenant check is skipped. The five permissions those
 * routes require all live in TENANT_SUPER_ADMIN_PERMISSIONS, so EVERY tenant's
 * seeded Super Admin holds them. Without this guard a Super Admin of tenant A
 * could target tenant B by putting B's id in the URL — including resetting B's
 * Super Admin password and taking the account over.
 *
 * This guard must run AFTER JwtAuthGuard, which populates `req.user` from the
 * verified JWT. Controller-level guards run after the global APP_GUARD chain, so
 * placing it in the controller's @UseGuards() after JwtAuthGuard satisfies that.
 */
@Injectable()
export class TenantParamScopeGuard implements CanActivate {
  private readonly logger = new Logger(TenantParamScopeGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = (request as any).user as
      | { sub?: string; companyId?: string; permissions?: string[] }
      | undefined;
    const targetTenantId = request.params?.tenantId;

    // Legitimate case: the caller is acting on their OWN tenant (a director
    // managing their own institution's admins).
    if (user?.companyId && user.companyId === targetTenantId) {
      return true;
    }

    // Genuine platform operator managing a specific tenant on purpose.
    if (user?.permissions?.includes(PERMISSIONS.MANAGE_TENANTS)) {
      return true;
    }

    // Cross-tenant attempt: authenticated, but reaching into a tenant that is
    // neither their own nor one they are entitled to administer as an operator.
    // Ids only, never any credential.
    this.logger.warn(
      `Cross-tenant admin access rejected: user ${user?.sub ?? 'unknown'} of company ${user?.companyId ?? 'unknown'} attempted to manage admins of tenant ${targetTenantId ?? 'unknown'}`,
    );
    throw new ForbiddenException(
      'You are not allowed to manage admins of this tenant',
    );
  }
}
