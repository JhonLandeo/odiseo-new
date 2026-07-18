import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRolesStore } from '../../src/modules/admin/store/roles.store';

/** Shape returned by a real `$fetch` rejection: status plus parsed body. */
function fetchError(status: number, data?: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${status}`), { status, data });
}

function buildRole(overrides: Record<string, unknown> = {}) {
  return {
    id: 'role-1',
    name: 'Coordinador',
    description: 'Rol de prueba',
    isSystemDefault: false,
    permissions: ['view_materials'],
    ...overrides,
  };
}

/**
 * jsdom sirve en `localhost`, así que `getSubdomain()` cae al tenant de sistema.
 * Todas las llamadas del store deben viajar con esa cabecera.
 */
const EXPECTED_SUBDOMAIN = 'odiseo';

describe('Roles Store (mutaciones de roles y asignación a usuarios)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('$fetch', vi.fn());
    // `fetchRoles` sigue usando `fetch` nativo; lo neutralizamos para que los
    // refrescos posteriores a cada mutación no ensucien las aserciones.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ json: async () => ({ data: [buildRole()] }) }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('createRole', () => {
    it('hace POST a /api/v1/admin/roles con el body y la cabecera x-subdomain', async () => {
      const store = useRolesStore();
      const created = buildRole({ id: 'role-nuevo' });
      vi.mocked(globalThis.$fetch as any).mockResolvedValue(created);

      const payload = {
        name: 'Coordinador',
        description: 'Coordina',
        permissions: ['view_materials'],
        inheritedRoleIds: ['role-padre'],
      };
      const result = await store.createRole(payload);

      expect(globalThis.$fetch).toHaveBeenCalledWith('/api/v1/admin/roles', {
        method: 'POST',
        headers: { 'x-subdomain': EXPECTED_SUBDOMAIN },
        body: payload,
      });
      expect(result).toEqual(created);
    });

    it('refresca la lista de roles tras crear', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue(buildRole());

      await store.createRole({ name: 'Coordinador' });

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/admin/roles', {
        headers: { 'x-subdomain': EXPECTED_SUBDOMAIN },
      });
      expect(store.roles).toEqual([buildRole()]);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('propaga el 403 de assertCanGrant con su mensaje intacto', async () => {
      const store = useRolesStore();
      const mensaje = 'You cannot grant permissions you do not hold: manage_users';
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(
        fetchError(403, { message: mensaje }),
      );

      await expect(
        store.createRole({ name: 'Coordinador', permissions: ['manage_users'] }),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe(mensaje);
      expect(store.loading).toBe(false);
    });
  });

  describe('updateRole', () => {
    it('hace PATCH a /api/v1/admin/roles/:id con el body y la cabecera x-subdomain', async () => {
      const store = useRolesStore();
      const updated = buildRole({ name: 'Coordinador Senior' });
      vi.mocked(globalThis.$fetch as any).mockResolvedValue(updated);

      const payload = { name: 'Coordinador Senior', permissions: ['view_materials'] };
      const result = await store.updateRole('role-1', payload);

      expect(globalThis.$fetch).toHaveBeenCalledWith('/api/v1/admin/roles/role-1', {
        method: 'PATCH',
        headers: { 'x-subdomain': EXPECTED_SUBDOMAIN },
        body: payload,
      });
      expect(result).toEqual(updated);
      // El refresco deja el store consistente con lo que responde el backend.
      expect(store.roles).toEqual([buildRole()]);
    });

    it('propaga el 403 de assertCanGrant con su mensaje intacto', async () => {
      const store = useRolesStore();
      const mensaje = 'You cannot grant permissions you do not hold: manage_roles';
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(
        fetchError(403, { message: mensaje }),
      );

      await expect(
        store.updateRole('role-1', { permissions: ['manage_roles'] }),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe(mensaje);
    });

    it('propaga el 409 al renombrar un rol de sistema', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(
        fetchError(409, { message: 'Cannot rename a system default role' }),
      );

      await expect(store.updateRole('role-1', { name: 'Otro' })).rejects.toMatchObject({
        status: 409,
      });

      expect(store.error).toBe('Cannot rename a system default role');
    });
  });

  describe('deleteRole', () => {
    it('hace DELETE a /api/v1/admin/roles/:id con la cabecera x-subdomain y sin body', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue(undefined);

      await store.deleteRole('role-1');

      expect(globalThis.$fetch).toHaveBeenCalledWith('/api/v1/admin/roles/role-1', {
        method: 'DELETE',
        headers: { 'x-subdomain': EXPECTED_SUBDOMAIN },
      });
      // Refresco posterior: la lista queda sincronizada con el backend.
      expect(globalThis.fetch).toHaveBeenCalled();
      expect(store.roles).toEqual([buildRole()]);
    });

    it('propaga el error en lugar de silenciarlo', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(
        fetchError(404, { message: 'Role not found' }),
      );

      await expect(store.deleteRole('inexistente')).rejects.toMatchObject({ status: 404 });

      expect(store.error).toBe('Role not found');
      expect(store.loading).toBe(false);
    });
  });

  describe('assignRolesToUser', () => {
    it('hace PUT a /api/v1/admin/users/:userId/roles con role_ids y x-subdomain', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({ success: true });

      await store.assignRolesToUser('user-7', ['role-1', 'role-2']);

      expect(globalThis.$fetch).toHaveBeenCalledWith('/api/v1/admin/users/user-7/roles', {
        method: 'PUT',
        headers: { 'x-subdomain': EXPECTED_SUBDOMAIN },
        body: { role_ids: ['role-1', 'role-2'] },
      });
      expect(store.error).toBeNull();
      expect(store.loading).toBe(false);
    });

    it('acepta una lista vacía: dejar al usuario sin roles es una operación válida', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({ success: true });

      await store.assignRolesToUser('user-7', []);

      expect(globalThis.$fetch).toHaveBeenCalledWith(
        '/api/v1/admin/users/user-7/roles',
        expect.objectContaining({ method: 'PUT', body: { role_ids: [] } }),
      );
    });

    it('no refresca la lista de roles: asignar no altera el catálogo', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockResolvedValue({ success: true });

      await store.assignRolesToUser('user-7', ['role-1']);

      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('propaga el 403 por permisos insuficientes con su mensaje', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(
        fetchError(403, { message: 'Forbidden resource' }),
      );

      await expect(
        store.assignRolesToUser('user-7', ['role-1']),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe('Forbidden resource');
      expect(store.loading).toBe(false);
    });

    it('usa el mensaje del Error cuando el backend no envía cuerpo', async () => {
      const store = useRolesStore();
      vi.mocked(globalThis.$fetch as any).mockRejectedValue(new Error('Network Error'));

      await expect(store.assignRolesToUser('user-7', ['role-1'])).rejects.toThrow(
        'Network Error',
      );

      expect(store.error).toBe('Network Error');
    });
  });
});
