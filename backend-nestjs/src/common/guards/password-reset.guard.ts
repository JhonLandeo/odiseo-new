import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ALLOW_DURING_PASSWORD_RESET_KEY } from '../decorators/allow-password-reset.decorator';

/**
 * Machine-readable discriminator on the 403 body. The frontend has to tell
 * "change your password" apart from an ordinary authorization failure in order
 * to redirect instead of showing a generic error, and it cannot do that by
 * matching on a human-readable message.
 */
export const PASSWORD_CHANGE_REQUIRED_CODE = 'PASSWORD_CHANGE_REQUIRED';

/**
 * AC-016 enforcement. While `force_password_reset` is set on the account, every
 * authenticated route is refused except the small allowlist marked with
 * @AllowDuringPasswordReset().
 *
 * This is enforced server-side rather than signalled to the client for a
 * reason: the JWT issued at login is entirely valid, so a flag in the login
 * response only stops clients that choose to honour it. Anyone calling the API
 * directly would walk straight past it.
 */
@Injectable()
export class PasswordResetGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isAllowed = this.reflector.getAllAndOverride<boolean>(
      ALLOW_DURING_PASSWORD_RESET_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isAllowed) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // No user on the request means JwtAuthGuard let this through as @Public().
    // Whether an anonymous route is reachable is that guard's decision, not
    // ours, and there is no account here to hold a flag.
    if (!user?.forcePasswordReset) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'Forbidden',
      code: PASSWORD_CHANGE_REQUIRED_CODE,
      message:
        'You must change your password before using this resource. ' +
        'POST /v1/auth/change-password to continue.',
    });
  }
}
