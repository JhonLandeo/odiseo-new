import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS, type Permission } from '@/core/auth/permissions';
import { CHANGE_PASSWORD_PATH } from '@/core/auth/password-change-required';
import { defineNuxtRouteMiddleware, navigateTo, abortNavigation } from '#app';

/**
 * Landing routes tried in order for an authenticated tenant user that hits a
 * public route. The first entry whose permission the user holds wins.
 */
export const LANDING_ROUTES: ReadonlyArray<{ path: string; permissions: Permission[] }> = [
  { path: '/materials', permissions: [PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.EDIT_MATERIALS] },
  { path: '/academic-time', permissions: [PERMISSIONS.VIEW_ACADEMIC_TIME] },
  { path: '/syllabus', permissions: [PERMISSIONS.VIEW_SYLLABUS] },
  { path: '/catalogs', permissions: [PERMISSIONS.VIEW_CATALOGS] },
];

/**
 * Where an authenticated user should land when they have no specific
 * destination. Returns null when no route matches their permissions.
 *
 * Shared with the change-password page so a user released from the hold ends up
 * exactly where a normal login would have put them.
 */
export function resolveLandingPath(authStore: {
  getSubdomain: () => string;
  hasPermission: (permission: Permission) => boolean;
}): string | null {
  if (authStore.getSubdomain() === 'odiseo') {
    return '/admin/dashboard';
  }

  const landing = LANDING_ROUTES.find((route) =>
    route.permissions.some((permission) => authStore.hasPermission(permission)),
  );
  return landing ? landing.path : null;
}

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore();

  // Try to rehydrate session on first request (SSR or Client)
  if (!authStore.isInitialized) {
    await authStore.fetchMe();
  }

  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.includes(to.path);

  // AC-016 password hold. Checked before anything else so a held user cannot
  // reach a page whose every request would 403. The change-password page itself
  // stays reachable, and logout is an action (not a route) that clears the store
  // and hard-navigates to /login, so the user can always leave.
  if (authStore.isAuthenticated && authStore.forcePasswordReset) {
    if (to.path !== CHANGE_PASSWORD_PATH) {
      return navigateTo(CHANGE_PASSWORD_PATH);
    }
    return;
  }

  // Nobody else has any business on the change-password page.
  if (to.path === CHANGE_PASSWORD_PATH) {
    return navigateTo(authStore.isAuthenticated ? (resolveLandingPath(authStore) ?? '/') : '/login');
  }

  // If route is public
  if (isPublicRoute) {
    if (authStore.isAuthenticated) {
      // Redirect authenticated users trying to access login page to the appropriate dashboard
      const landing = resolveLandingPath(authStore);
      if (landing) {
        return navigateTo(landing);
      }

      // Only a genuinely broken session (no permissions at all) is logged out.
      // A user who simply lacks material permissions must never be kicked out:
      // that turned a permission gap into a forced logout loop.
      if (!authStore.user?.permissions?.length) {
        await authStore.logout();
        return;
      }

      // Authenticated with permissions we have no landing route for: let them
      // stay on the public page rather than destroying a valid session.
      return;
    }
    return;
  }

  // Protect all private routes
  if (!authStore.isAuthenticated) {
    return navigateTo('/login');
  }

  // Role-based Access Control (RBAC) check
  const requiredRoles = to.meta.roles as string[] | undefined;
  if (requiredRoles && Array.isArray(requiredRoles)) {
    const hasRequiredRole = requiredRoles.some((role) => authStore.hasRole(role));
    if (!hasRequiredRole) {
      return abortNavigation({
        statusCode: 403,
        statusMessage: 'Access Denied: Insufficient roles',
      });
    }
  }

  // Permission-based Access Control check
  const requiredPermissions = to.meta.permissions as Permission[] | undefined;
  if (requiredPermissions && Array.isArray(requiredPermissions)) {
    const hasRequiredPermission = requiredPermissions.some((permission) =>
      authStore.hasPermission(permission),
    );
    if (!hasRequiredPermission) {
      return abortNavigation({
        statusCode: 403,
        statusMessage: 'Access Denied: Missing required permission',
      });
    }
  }
});
