import { useAuthStore } from '@/stores/auth.store';
import { PERMISSIONS, type Permission } from '@/core/auth/permissions';
import { defineNuxtRouteMiddleware, navigateTo, abortNavigation } from '#app';

/**
 * Landing routes tried in order for an authenticated tenant user that hits a
 * public route. The first entry whose permission the user holds wins.
 */
const LANDING_ROUTES: ReadonlyArray<{ path: string; permissions: Permission[] }> = [
  { path: '/materials', permissions: [PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.EDIT_MATERIALS] },
  { path: '/academic-time', permissions: [PERMISSIONS.VIEW_ACADEMIC_TIME] },
  { path: '/syllabus', permissions: [PERMISSIONS.VIEW_SYLLABUS] },
  { path: '/catalogs', permissions: [PERMISSIONS.VIEW_CATALOGS] },
];

export default defineNuxtRouteMiddleware(async (to) => {
  const authStore = useAuthStore();

  // Try to rehydrate session on first request (SSR or Client)
  if (!authStore.isInitialized) {
    await authStore.fetchMe();
  }

  const publicRoutes = ['/login'];
  const isPublicRoute = publicRoutes.includes(to.path);

  // If route is public
  if (isPublicRoute) {
    if (authStore.isAuthenticated) {
      // Redirect authenticated users trying to access login page to the appropriate dashboard
      if (authStore.getSubdomain() === 'odiseo') {
        return navigateTo('/admin/dashboard');
      }

      const landing = LANDING_ROUTES.find((route) =>
        route.permissions.some((permission) => authStore.hasPermission(permission)),
      );
      if (landing) {
        return navigateTo(landing.path);
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
