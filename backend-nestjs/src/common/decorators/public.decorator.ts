import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or a whole controller) as reachable without a JWT.
 * Authentication is global by default (JwtAuthGuard is registered as an
 * APP_GUARD), so opting out has to be explicit and auditable: every usage of
 * this decorator is a deliberate hole in the authentication perimeter.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
