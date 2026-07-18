import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ClsService } from 'nestjs-cls';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY } from '../common/decorators/public.decorator';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // This guard runs globally (APP_GUARD), so routes that must stay reachable
    // without a session (login, branding, machine-to-machine webhooks) opt out
    // explicitly via @Public(). Handler metadata overrides controller metadata.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // Extract JWT from httpOnly cookie (not Authorization header)
    const token = request.cookies?.jwt;
    if (!token) {
      throw new UnauthorizedException('No authentication token provided');
    }

    try {
      const payload = this.authService.verifyToken(token);

      // The session cookie is issued for the whole COOKIE_DOMAIN, so the browser
      // replays it on every tenant subdomain. TenantMiddleware resolves the
      // tenant from the subdomain, but authorization downstream reads companyId
      // from the token: without this check a user of tenant A could drive
      // tenant B's schema simply by switching subdomains.
      // A route with no tenant in CLS is a platform/admin route (TenantMiddleware
      // skips resolution for its publicPaths) and must stay reachable.
      const requestCompanyId = this.cls.get('companyId');
      if (requestCompanyId && requestCompanyId !== payload.companyId) {
        // Security event, not a routine 401: this is the signature of a session
        // replayed across tenants. Ids only — never the token itself.
        this.logger.warn(
          `Cross-tenant session rejected: user ${payload.sub} presented a token for company ${payload.companyId} on a request resolved to company ${String(requestCompanyId)}`,
        );
        throw new ForbiddenException('Session does not belong to this tenant');
      }

      // Dynamically load permissions and the password-reset hold to avoid stale
      // claims — one cached lookup serves both downstream guards.
      const { permissions, forcePasswordReset } =
        await this.authService.getUserAuthState(payload.sub, payload.companyId);

      // Attach decoded user and fresh state to request for downstream use
      (request as any).user = {
        ...payload,
        permissions,
        forcePasswordReset,
      };
      return true;
    } catch (error) {
      // Only a genuine verification/lookup failure means "unauthenticated".
      // Deliberate rejections (tenant mismatch, and anything an inner call
      // raises on purpose) must reach the client with their own status.
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Token expired or invalid');
    }
  }
}
