import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The store now talks to the central HTTP client (`useApi`) instead of a bare
 * `$fetch`/`fetch`. The tenant `x-subdomain` header is attached by the client's
 * interceptor, so it is asserted in `api.plugin.spec.ts`, not here. These tests
 * keep their original intent — correct path, method, body (incl. the snake_case
 * `role_ids`), error propagation and refresh behaviour — against the client.
 */

// A single mock stands in for the `$fetch` instance the plugin provides.
const api = vi.fn();
vi.mock('@/composables/useApi', () => ({ useApi: () => api }));

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

/** URL of the roles list — hit by `fetchRoles`, i.e. the post-mutation refresh. */
const ROLES_URL = '/api/v1/admin/roles';

/**
 * `fetchRoles` calls `api(ROLES_URL)` with no options. Every mutation calls
 * `api(url, { method, body })`. This implementation answers the refresh with a
 * one-role list and lets each test control the mutation's own result.
 */
function withMutation(result: unknown, reject = false) {
  api.mockImplementation(async (_url: string, options?: { method?: string }) => {
    if (!options) return { data: [buildRole()] }; // fetchRoles refresh
    if (reject) throw result;
    return result;
  });
}

describe('Roles Store (mutaciones de roles y asignación a usuarios)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createRole', () => {
    it('hace POST a /api/v1/admin/roles con el body (sin cabecera manual: la pone el interceptor)', async () => {
      const store = useRolesStore();
      const created = buildRole({ id: 'role-nuevo' });
      withMutation(created);

      const payload = {
        name: 'Coordinador',
        description: 'Coordina',
        permissions: ['view_materials'],
        inheritedRoleIds: ['role-padre'],
      };
      const result = await store.createRole(payload);

      expect(api).toHaveBeenCalledWith(ROLES_URL, {
        method: 'POST',
        body: payload,
      });
      expect(result).toEqual(created);
    });

    it('refresca la lista de roles tras crear', async () => {
      const store = useRolesStore();
      withMutation(buildRole());

      await store.createRole({ name: 'Coordinador' });

      // El refresco es un GET sin opciones a la misma URL.
      expect(api).toHaveBeenCalledWith(ROLES_URL);
      expect(store.roles).toEqual([buildRole()]);
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it('propaga el 403 de assertCanGrant con su mensaje intacto', async () => {
      const store = useRolesStore();
      const mensaje = 'You cannot grant permissions you do not hold: manage_users';
      withMutation(fetchError(403, { message: mensaje }), true);

      await expect(
        store.createRole({ name: 'Coordinador', permissions: ['manage_users'] }),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe(mensaje);
      expect(store.loading).toBe(false);
    });
  });

  describe('updateRole', () => {
    it('hace PATCH a /api/v1/admin/roles/:id con el body', async () => {
      const store = useRolesStore();
      const updated = buildRole({ name: 'Coordinador Senior' });
      withMutation(updated);

      const payload = { name: 'Coordinador Senior', permissions: ['view_materials'] };
      const result = await store.updateRole('role-1', payload);

      expect(api).toHaveBeenCalledWith('/api/v1/admin/roles/role-1', {
        method: 'PATCH',
        body: payload,
      });
      expect(result).toEqual(updated);
      // El refresco deja el store consistente con lo que responde el backend.
      expect(store.roles).toEqual([buildRole()]);
    });

    it('propaga el 403 de assertCanGrant con su mensaje intacto', async () => {
      const store = useRolesStore();
      const mensaje = 'You cannot grant permissions you do not hold: manage_roles';
      withMutation(fetchError(403, { message: mensaje }), true);

      await expect(
        store.updateRole('role-1', { permissions: ['manage_roles'] }),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe(mensaje);
    });

    it('propaga el 409 al renombrar un rol de sistema', async () => {
      const store = useRolesStore();
      withMutation(fetchError(409, { message: 'Cannot rename a system default role' }), true);

      await expect(store.updateRole('role-1', { name: 'Otro' })).rejects.toMatchObject({
        status: 409,
      });

      expect(store.error).toBe('Cannot rename a system default role');
    });
  });

  describe('deleteRole', () => {
    it('hace DELETE a /api/v1/admin/roles/:id sin body', async () => {
      const store = useRolesStore();
      withMutation(undefined);

      await store.deleteRole('role-1');

      expect(api).toHaveBeenCalledWith('/api/v1/admin/roles/role-1', {
        method: 'DELETE',
      });
      // Refresco posterior: la lista queda sincronizada con el backend.
      expect(api).toHaveBeenCalledWith(ROLES_URL);
      expect(store.roles).toEqual([buildRole()]);
    });

    it('propaga el error en lugar de silenciarlo', async () => {
      const store = useRolesStore();
      withMutation(fetchError(404, { message: 'Role not found' }), true);

      await expect(store.deleteRole('inexistente')).rejects.toMatchObject({ status: 404 });

      expect(store.error).toBe('Role not found');
      expect(store.loading).toBe(false);
    });
  });

  describe('assignRolesToUser', () => {
    it('hace PUT a /api/v1/admin/users/:userId/roles con role_ids (snake_case)', async () => {
      const store = useRolesStore();
      withMutation({ success: true });

      await store.assignRolesToUser('user-7', ['role-1', 'role-2']);

      expect(api).toHaveBeenCalledWith('/api/v1/admin/users/user-7/roles', {
        method: 'PUT',
        body: { role_ids: ['role-1', 'role-2'] },
      });
      expect(store.error).toBeNull();
      expect(store.loading).toBe(false);
    });

    it('acepta una lista vacía: dejar al usuario sin roles es una operación válida', async () => {
      const store = useRolesStore();
      withMutation({ success: true });

      await store.assignRolesToUser('user-7', []);

      expect(api).toHaveBeenCalledWith(
        '/api/v1/admin/users/user-7/roles',
        expect.objectContaining({ method: 'PUT', body: { role_ids: [] } }),
      );
    });

    it('no refresca la lista de roles: asignar no altera el catálogo', async () => {
      const store = useRolesStore();
      withMutation({ success: true });

      await store.assignRolesToUser('user-7', ['role-1']);

      // Una sola llamada (la asignación); no hay GET de refresco a ROLES_URL.
      expect(api).toHaveBeenCalledTimes(1);
      expect(api).not.toHaveBeenCalledWith(ROLES_URL);
    });

    it('propaga el 403 por permisos insuficientes con su mensaje', async () => {
      const store = useRolesStore();
      withMutation(fetchError(403, { message: 'Forbidden resource' }), true);

      await expect(
        store.assignRolesToUser('user-7', ['role-1']),
      ).rejects.toMatchObject({ status: 403 });

      expect(store.error).toBe('Forbidden resource');
      expect(store.loading).toBe(false);
    });

    it('usa el mensaje del Error cuando el backend no envía cuerpo', async () => {
      const store = useRolesStore();
      withMutation(new Error('Network Error'), true);

      await expect(store.assignRolesToUser('user-7', ['role-1'])).rejects.toThrow(
        'Network Error',
      );

      expect(store.error).toBe('Network Error');
    });
  });
});
