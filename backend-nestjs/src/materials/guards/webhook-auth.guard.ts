import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { timingSafeEqual } from 'crypto';

/**
 * Protects the internal material-status webhook with a shared secret.
 *
 * The caller must send `x-webhook-secret` matching `WORKER_WEBHOOK_SECRET`.
 * Posture:
 *  - Secret configured  → enforced (constant-time comparison).
 *  - Secret unset + prod → fail closed (misconfiguration must not silently
 *    leave a state-mutating endpoint open).
 *  - Secret unset + dev  → allowed, with a loud warning (local convenience).
 */
@Injectable()
export class WebhookAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebhookAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const secret = process.env.WORKER_WEBHOOK_SECRET;

    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('Webhook authentication is not configured');
      }
      this.logger.warn(
        'WORKER_WEBHOOK_SECRET is not set — webhook is UNPROTECTED (dev only). Set it before production.',
      );
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-webhook-secret'];

    if (typeof provided !== 'string' || !this.safeEqual(provided, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }

  private safeEqual(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }
}
