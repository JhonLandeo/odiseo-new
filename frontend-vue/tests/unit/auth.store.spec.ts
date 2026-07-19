import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../src/stores/auth.store';
import { PERMISSIONS } from '../../src/core/auth/permissions';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Auth Store (Spatie RBAC Hydration)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('debería inicializarse con estado no autenticado', () => {
    const authStore = useAuthStore();
    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.user).toBeNull();
  });

  it('hasRole debería retornar true si el usuario tiene el rol específico', () => {
    const authStore = useAuthStore();
    // Simular hidratación de login
    authStore.user = {
      id: 'uuid-1',
      name: 'Admin Colegio',
      email: 'admin@colegio.com',
      companyId: 'uuid-company-A',
      roles: ['super-admin', 'teacher'],
      permissions: [PERMISSIONS.VIEW_MATERIALS]
    };
    authStore.isAuthenticated = true;

    expect(authStore.hasRole('super-admin')).toBe(true);
    expect(authStore.hasRole('teacher')).toBe(true);
    expect(authStore.hasRole('student')).toBe(false);
  });

  it('hasPermission debería retornar true si el usuario tiene el permiso específico', () => {
    const authStore = useAuthStore();
    
    authStore.user = {
      id: 'uuid-1',
      name: 'Admin Colegio',
      email: 'admin@colegio.com',
      companyId: 'uuid-company-A',
      roles: ['super-admin'],
      permissions: [PERMISSIONS.VIEW_MATERIALS, PERMISSIONS.EDIT_MATERIALS]
    };
    authStore.isAuthenticated = true;

    expect(authStore.hasPermission(PERMISSIONS.VIEW_MATERIALS)).toBe(true);
    expect(authStore.hasPermission(PERMISSIONS.EDIT_MATERIALS)).toBe(true);
    expect(authStore.hasPermission(PERMISSIONS.VIEW_CATALOGS)).toBe(false);
  });

  it('logout debería limpiar el estado', () => {
    const authStore = useAuthStore();
    authStore.user = { id: 'uuid-1' } as any;
    authStore.isAuthenticated = true;
    
    authStore.logout();

    expect(authStore.isAuthenticated).toBe(false);
    expect(authStore.user).toBeNull();
  });
});
