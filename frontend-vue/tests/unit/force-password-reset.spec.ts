import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useAuthStore } from '../../src/stores/auth.store';
import { PERMISSIONS } from '../../src/core/auth/permissions';
import {
  isPasswordChangeRequiredError,
  CHANGE_PASSWORD_PATH,
} from '../../src/core/auth/password-change-required';
import authMiddleware, { resolveLandingPath } from '../../src/middleware/auth.global';
import { navigateTo, abortNavigation } from '#app';

/** Shape returned by a real `$fetch` rejection: status plus parsed body. */
function fetchError(status: number, data?: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, data });
}

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uuid-1',
    name: 'Directora',
    email: 'directora@colegio.com',
    companyId: 'uuid-company-A',
    roles: ['teacher'],
    permissions: [PERMISSIONS.VIEW_MATERIALS],
    ...overrides,
  };
}

describe('Forced password change (AC-016)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.mocked(navigateTo).mockClear();
    vi.mocked(abortNavigation).mockClear();
    vi.stubGlobal('$fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('auth store: flag exposure', () => {
    it('expone forcePasswordReset desde la respuesta de login', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({
        user: buildUser({ forcePasswordReset: true }),
      });

      const ok = await authStore.login({ email: 'a@b.com', password: 'x' }, 'colegio');

      expect(ok).toBe(true);
      expect(authStore.forcePasswordReset).toBe(true);
    });

    it('expone forcePasswordReset desde fetchMe', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({
        user: buildUser({ forcePasswordReset: true }),
      });

      await authStore.fetchMe();

      expect(authStore.isAuthenticated).toBe(true);
      expect(authStore.forcePasswordReset).toBe(true);
    });

    it('es false cuando el backend no retiene al usuario', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({
        user: buildUser({ forcePasswordReset: false }),
      });

      await authStore.fetchMe();

      expect(authStore.forcePasswordReset).toBe(false);
    });
  });

  describe('auth store: changePassword', () => {
    it('mapea 401 a invalid-current-password', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(fetchError(401));

      const result = await authStore.changePassword('mala', 'nuevaClave123');

      expect(result).toEqual({ ok: false, reason: 'invalid-current-password' });
    });

    it('mapea 400 a weak-password', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(fetchError(400));

      const result = await authStore.changePassword('actual123', 'corta');

      expect(result).toEqual({ ok: false, reason: 'weak-password' });
    });

    it('mapea 429 a rate-limited', async () => {
      const authStore = useAuthStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(fetchError(429));

      const result = await authStore.changePassword('actual123', 'nuevaClave123');

      expect(result).toEqual({ ok: false, reason: 'rate-limited' });
    });

    it('mantiene los tres fallos como resultados distintos', async () => {
      const authStore = useAuthStore();
      const reasons: string[] = [];

      for (const status of [401, 400, 429]) {
        vi.mocked(globalThis.$fetch as any).mockRejectedValueOnce(fetchError(status));
        const result = await authStore.changePassword('actual123', 'nuevaClave123');
        if (!result.ok) reasons.push(result.reason);
      }

      expect(new Set(reasons).size).toBe(3);
    });

    it('un cambio exitoso (204) refresca la sesión y libera la retención', async () => {
      const authStore = useAuthStore();
      const fetchMock = vi.mocked(globalThis.$fetch as any);

      // Start held.
      fetchMock.mockResolvedValueOnce({ user: buildUser({ forcePasswordReset: true }) });
      await authStore.fetchMe();
      expect(authStore.forcePasswordReset).toBe(true);

      // change-password answers 204 (no body), then fetchMe returns the freed user.
      fetchMock.mockResolvedValueOnce(undefined);
      fetchMock.mockResolvedValueOnce({ user: buildUser({ forcePasswordReset: false }) });

      const result = await authStore.changePassword('actual123', 'nuevaClave123');

      expect(result).toEqual({ ok: true });
      expect(authStore.forcePasswordReset).toBe(false);
      // The 204 gave us nothing to trust, so we re-read the session.
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/auth/me',
        expect.objectContaining({ method: 'GET' }),
      );
    });
  });

  describe('global middleware', () => {
    function holdUser() {
      const authStore = useAuthStore();
      authStore.user = buildUser({ forcePasswordReset: true }) as any;
      authStore.isAuthenticated = true;
      authStore.isInitialized = true;
      return authStore;
    }

    it('redirige a un usuario retenido desde cualquier otra ruta', async () => {
      holdUser();

      await (authMiddleware as any)({ path: '/materials', meta: {} });

      expect(navigateTo).toHaveBeenCalledWith(CHANGE_PASSWORD_PATH);
    });

    it('redirige a un usuario retenido incluso desde /login', async () => {
      holdUser();

      await (authMiddleware as any)({ path: '/login', meta: {} });

      expect(navigateTo).toHaveBeenCalledWith(CHANGE_PASSWORD_PATH);
    });

    it('deja la propia página de cambio de contraseña accesible', async () => {
      holdUser();

      await (authMiddleware as any)({ path: CHANGE_PASSWORD_PATH, meta: {} });

      expect(navigateTo).not.toHaveBeenCalled();
    });

    it('no cierra la sesión de un usuario retenido: logout sigue disponible', async () => {
      const authStore = holdUser();
      const logoutSpy = vi.spyOn(authStore, 'logout');

      await (authMiddleware as any)({ path: CHANGE_PASSWORD_PATH, meta: {} });

      expect(logoutSpy).not.toHaveBeenCalled();
      expect(authStore.isAuthenticated).toBe(true);
    });

    it('no molesta a un usuario no retenido', async () => {
      const authStore = useAuthStore();
      authStore.user = buildUser({ forcePasswordReset: false }) as any;
      authStore.isAuthenticated = true;
      authStore.isInitialized = true;

      await (authMiddleware as any)({ path: '/materials', meta: {} });

      expect(navigateTo).not.toHaveBeenCalled();
      expect(abortNavigation).not.toHaveBeenCalled();
    });

    it('sigue abortando por permisos faltantes (comportamiento existente)', async () => {
      const authStore = useAuthStore();
      authStore.user = buildUser({ forcePasswordReset: false }) as any;
      authStore.isAuthenticated = true;
      authStore.isInitialized = true;

      await (authMiddleware as any)({
        path: '/catalogs',
        meta: { permissions: [PERMISSIONS.VIEW_CATALOGS] },
      });

      expect(abortNavigation).toHaveBeenCalled();
    });

    it('expulsa de /change-password a quien no está retenido', async () => {
      const authStore = useAuthStore();
      authStore.user = buildUser({ forcePasswordReset: false }) as any;
      authStore.isAuthenticated = true;
      authStore.isInitialized = true;

      await (authMiddleware as any)({ path: CHANGE_PASSWORD_PATH, meta: {} });

      // jsdom's hostname is `localhost`, so getSubdomain() falls back to the
      // system tenant 'odiseo' and the landing table resolves to the admin
      // dashboard. The point is that they are sent away from the hold page.
      expect(navigateTo).toHaveBeenCalledWith('/admin/dashboard');
    });

    it('usa la tabla LANDING_ROUTES para un tenant normal', () => {
      const authStore = useAuthStore();
      authStore.user = buildUser({ permissions: [PERMISSIONS.VIEW_SYLLABUS] }) as any;

      const landing = resolveLandingPath({
        getSubdomain: () => 'colegio',
        hasPermission: authStore.hasPermission,
      });

      expect(landing).toBe('/syllabus');
    });
  });

  describe('403 PASSWORD_CHANGE_REQUIRED detection', () => {
    it('reconoce el 403 con el código del backend', () => {
      expect(
        isPasswordChangeRequiredError(fetchError(403, { code: 'PASSWORD_CHANGE_REQUIRED' })),
      ).toBe(true);
    });

    it('ignora un 403 de permisos ordinario (sin código)', () => {
      expect(isPasswordChangeRequiredError(fetchError(403, { message: 'Forbidden' }))).toBe(false);
    });

    it('ignora otros estados', () => {
      expect(
        isPasswordChangeRequiredError(fetchError(401, { code: 'PASSWORD_CHANGE_REQUIRED' })),
      ).toBe(false);
      expect(isPasswordChangeRequiredError(null)).toBe(false);
    });

    it('markPasswordChangeRequired sincroniza el estado obsoleto', () => {
      const authStore = useAuthStore();
      authStore.user = buildUser({ forcePasswordReset: false }) as any;
      authStore.isAuthenticated = true;

      authStore.markPasswordChangeRequired();

      expect(authStore.forcePasswordReset).toBe(true);
    });
  });
});
