import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { PermissionType } from '../../admin/roles/constants/permissions.constant';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { NO_PERMISSIONS_REQUIRED_KEY } from '../decorators/authenticated-only.decorator';

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';
export const RequirePermissions = (...permissions: PermissionType[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);

/**
 * Global authorization guard (registered as an APP_GUARD, after JwtAuthGuard).
 *
 * Authorization is DENY-BY-DEFAULT. The guard resolves every route through a
 * four-way decision, in order:
 *
 *   1. `@Public()`            -> allow. Public routes carry no JWT and thus no
 *                                user; they already opted out of the whole
 *                                perimeter (JwtAuthGuard skips them too).
 *   2. `@AuthenticatedOnly()` -> allow. The user was authenticated by
 *                                JwtAuthGuard; the route deliberately and
 *                                auditably requires no specific permission.
 *   3. `@RequirePermissions`  -> enforce: the user must hold ALL listed
 *                                permissions (AND semantics).
 *   4. no metadata at all     -> DENY with an explicit error.
 *
 * WHY deny-by-default: authentication is already deny-by-default, but
 * authorization used to be allow-by-default — a developer who forgot
 * `@RequirePermissions` on a new route silently exposed it to every
 * authenticated user of every tenant (this actually happened: the Materials
 * module shipped with zero permission decorators). Inverting the default makes
 * that failure mode loud: an unannotated route 403s immediately in
 * development instead of shipping as an invisible hole.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    // (1) Public routes have no user at all; without this branch they would
    // 403 under the deny-by-default rule below.
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    if (isPublic) {
      return true;
    }

    // (2) Explicit, auditable opt-out: authenticated but permission-less.
    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      NO_PERMISSIONS_REQUIRED_KEY,
      targets,
    );
    if (authenticatedOnly) {
      return true;
    }

    // (3) Declared permission policy: enforce AND semantics.
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionType[]
    >(REQUIRE_PERMISSIONS_KEY, targets);
    if (requiredPermissions) {
      const request = context.switchToHttp().getRequest();
      const user = request.user;

      if (!user || !user.permissions) {
        return false;
      }

      // Check if the user has all required permissions
      return requiredPermissions.every((permission) =>
        user.permissions.includes(permission),
      );
    }

    // (4) No metadata of any kind: DENY. Every route must carry an explicit
    // authorization policy; the message names the cause so a forgotten
    // decorator is obvious in logs instead of silently allowed.
    throw new ForbiddenException(
      'Route has no permission policy: declare @RequirePermissions(...), @AuthenticatedOnly(), or @Public()',
    );
  }
}
