import { SetMetadata } from '@nestjs/common';

export const ALLOW_DURING_PASSWORD_RESET_KEY = 'allowDuringPasswordReset';

/**
 * Marks a route as reachable while the caller's account is held under
 * `force_password_reset`.
 *
 * PasswordResetGuard runs globally and denies everything by default, so this is
 * the only escape hatch. It exists to break an otherwise fatal deadlock: an
 * account that must change its password cannot do so if the change-password
 * endpoint is itself blocked. Mirrors @Public(): every usage is a deliberate,
 * auditable hole, and the allowlist must stay limited to what an account in
 * that state legitimately needs — discovering the state, resolving it, and
 * walking away from the session.
 */
export const AllowDuringPasswordReset = () =>
  SetMetadata(ALLOW_DURING_PASSWORD_RESET_KEY, true);
