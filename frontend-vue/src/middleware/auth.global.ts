import { useAuthStore } from '@/stores/auth.store';
import { defineNuxtRouteMiddleware, navigateTo, abortNavigation } from '#app';

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
      if (authStore.hasPermission('generate_material') || authStore.hasPermission('view_materials')) {
        return navigateTo('/materials');
      }
      // If they are authenticated but lack permissions, log them out to clear the stale session
      await authStore.logout();
    }
    return;
  }
  
  // Protect all private routes
  if (!authStore.isAuthenticated) {
    return navigateTo('/login');
  }
  
  // Role-based Access Control (RBAC) check
  if (to.meta.roles && Array.isArray(to.meta.roles)) {
    const hasRequiredRole = to.meta.roles.some(role => authStore.hasRole(role as string));
    if (!hasRequiredRole) {
      return abortNavigation({
        statusCode: 403,
        statusMessage: 'Access Denied: Insufficient roles'
      });
    }
  }
  
  // Permission-based Access Control check
  if (to.meta.permissions && Array.isArray(to.meta.permissions)) {
    const hasRequiredPermission = to.meta.permissions.some(permission => authStore.hasPermission(permission as string));
    if (!hasRequiredPermission) {
      return abortNavigation({
        statusCode: 403,
        statusMessage: 'Access Denied: Missing required permission'
      });
    }
  }
});
