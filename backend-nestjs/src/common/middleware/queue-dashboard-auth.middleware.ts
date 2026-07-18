import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../../auth/auth.service';
import { PERMISSIONS } from '../../admin/roles/constants/permissions.constant';

/**
 * Authentication/authorization for the Bull Board dashboard mounted at /queues.
 *
 * The dashboard is NOT a Nest controller: @bull-board/nestjs registers its
 * Express router as raw middleware, so the global APP_GUARD chain
 * (JwtAuthGuard → PasswordResetGuard → PermissionsGuard) never runs for it.
 * Without this middleware the platform-wide job admin UI — which can inspect,
 * retry and delete jobs belonging to every tenant — is reachable with no
 * session at all.
 *
 * It deliberately reuses the same credential the rest of the API trusts (the
 * httpOnly `jwt` cookie, verified by AuthService) instead of a separate
 * dashboard password, and requires the same platform-level permission that
 * gates the other cross-tenant surfaces (see DashboardController).
 *
 * Fail-closed: anything unexpected denies. A dashboard that opens up when the
 * database or Redis hiccups is worse than one that is briefly unavailable.
 */
@Injectable()
export class QueueDashboardAuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(QueueDashboardAuthMiddleware.name);

  /**
   * getUserAuthState reaches Redis (permission cache) and then Postgres. Neither
   * client is configured with a command timeout, so a hung Redis would hang this
   * middleware — and the dashboard is exactly what an operator opens when the
   * queues are already misbehaving. Bounding the wait here rather than in
   * AuthModule keeps the blast radius to /queues instead of changing the global
   * guard's behaviour for every request in the API.
   *
   * Generous enough that a healthy lookup (cache hit is sub-millisecond, cache
   * miss is one schema-scoped query) never trips it.
   */
  private static readonly AUTH_STATE_TIMEOUT_MS = 5000;

  constructor(private readonly authService: AuthService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Same extraction as JwtAuthGuard: the session lives in an httpOnly
    // cookie, never in an Authorization header.
    const token = req.cookies?.jwt;
    if (!token) {
      this.deny(res, 401, 'No authentication token provided');
      return;
    }

    try {
      const payload = this.authService.verifyToken(token);

      // Permissions are loaded per request rather than read off the token, so a
      // revoked administrator loses the dashboard as soon as the cache expires
      // instead of when their token does.
      const { permissions } = await this.withTimeout(
        this.authService.getUserAuthState(payload.sub, payload.companyId),
      );

      if (!permissions?.includes(PERMISSIONS.MANAGE_TENANTS)) {
        // A valid session that is not entitled to the platform-wide job admin
        // UI is worth a trace: it is either a misconfigured role or probing.
        this.logger.warn(
          `Queue dashboard access denied: user ${payload.sub} lacks ${PERMISSIONS.MANAGE_TENANTS}`,
        );
        this.deny(res, 403, 'Insufficient permissions');
        return;
      }

      next();
    } catch (error) {
      // Every failure path lands here on purpose — an invalid token, a missing
      // user, a lookup that threw. None of them are grounds to let the request
      // through, and `next()` is never called from the catch.
      //
      // Logged so an infrastructure fault (Redis or Postgres unreachable, or the
      // bounded wait below expiring) is distinguishable from a genuine auth
      // rejection: both answer 401, and without this they look identical.
      this.logger.warn(
        `Queue dashboard access denied: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
      );
      this.deny(res, 401, 'Token expired or invalid');
    }
  }

  /**
   * Fails CLOSED: a timeout rejects, which the catch above turns into the same
   * 401 the middleware already returns for any other lookup failure. The fast
   * path is untouched — the timer is cleared as soon as the lookup settles, so
   * a resolved promise never keeps the event loop alive.
   */
  private withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Auth state lookup timed out after ${QueueDashboardAuthMiddleware.AUTH_STATE_TIMEOUT_MS}ms`,
            ),
          ),
        QueueDashboardAuthMiddleware.AUTH_STATE_TIMEOUT_MS,
      );
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  private deny(res: Response, status: number, message: string): void {
    res.status(status).json({ statusCode: status, message });
  }
}
