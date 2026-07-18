import { SetMetadata } from '@nestjs/common';

export const NO_PERMISSIONS_REQUIRED_KEY = 'noPermissionsRequired';

/**
 * Marks a route (or a whole controller) as requiring authentication but no
 * specific permission. Authorization is deny-by-default (PermissionsGuard is
 * registered as an APP_GUARD and rejects any route without a permission
 * policy), so opting out has to be explicit and auditable: every usage of this
 * decorator is a deliberate decision to leave a route reachable by ANY
 * authenticated user of ANY tenant, regardless of their permissions.
 *
 * Legitimate uses are routes that only act on the caller's own account or
 * per-user state (e.g. "who am I", "change my password", "my onboarding
 * progress"). If a route exposes tenant data or admin capability, it needs
 * `@RequirePermissions(...)` instead — never this.
 */
export const AuthenticatedOnly = () =>
  SetMetadata(NO_PERMISSIONS_REQUIRED_KEY, true);
