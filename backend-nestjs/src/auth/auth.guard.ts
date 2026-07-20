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
      const { permissions, forcePasswordReset, tokensValidAfter } =
        await this.authService.getUserAuthState(payload.sub, payload.companyId);

      // JWT revocation: AuthService.revokeUserTokens stamps tokensValidAfter
      // to the instant a user's authority or account state last changed
      // (logout, password change, deactivation, credential reset, role
      // change). A token issued (iat, seconds) before that instant must be
      // rejected here even though it has not otherwise expired — that is the
      // whole point of a durable, cache-backed revocation mechanism instead
      // of just waiting out the token's 24h lifetime. tokensValidAfter is
      // null for an account that has never been revoked.
      //
      // Compared at whole-second granularity on both sides: `iat` is seconds
      // (jsonwebtoken truncates down, per the JWT spec), but tokensValidAfter
      // is a millisecond Date. Comparing iat*1000 directly against the raw
      // millisecond value would false-reject a token minted legitimately
      // AFTER a revocation whenever both land in the same wall-clock second
      // (e.g. an immediate re-login right after logout) — iat's truncation
      // alone can put it below tokensValidAfter's ms offset even though the
      // real mint time was later. Flooring tokensValidAfter to the second
      // removes that false positive; the tradeoff is a token minted in the
      // very same second as a revocation it should have missed stays valid
      // for up to one extra second, which is what the existing 60s Redis /
      // 4s local cache freshness window already tolerates by design.
      const tokensValidAfterSec =
        tokensValidAfter !== null ? Math.floor(tokensValidAfter / 1000) : null;
      if (tokensValidAfterSec !== null && payload.iat < tokensValidAfterSec) {
        this.logger.warn(
          `Revoked token rejected for user ${payload.sub} in company ${payload.companyId}`,
        );
        throw new UnauthorizedException('Token revoked');
      }

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
