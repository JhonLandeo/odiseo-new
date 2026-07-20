import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useApi } from '@/composables/useApi';
import type { Role, CreateRoleDto, UpdateRoleDto } from '../types/roles.types';

export const useRolesStore = defineStore('roles', () => {
  const roles = ref<Role[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchRoles() {
    loading.value = true;
    try {
      // Goes through the central client so it rejects on 4xx instead of the old
      // native `fetch`, which resolved on error and silently swallowed it. The
      // tenant `x-subdomain` header is added by the client interceptor.
      const api = useApi();
      const result = await api<{ data: Role[] }>('/api/v1/admin/roles');
      roles.value = result.data;
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  // Todas las llamadas viajan por el cliente central (`useApi`): rechaza ante un
  // 4xx y expone el cuerpo del error en `e.data`, así que un 403 de
  // `assertCanGrant` ("no puedes otorgar permisos que no tienes") llega al catch
  // con su mensaje real. El error se guarda en el store Y se relanza, igual que
  // en `features/admin/store/tenants.ts`, para que la vista pueda mostrarlo al usuario.

  async function createRole(payload: CreateRoleDto) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const role = await api<Role>('/api/v1/admin/roles', {
        method: 'POST',
        body: payload
      });
      await fetchRoles();
      return role;
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error creando el rol';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function updateRole(id: string, payload: UpdateRoleDto) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const role = await api<Role>(`/api/v1/admin/roles/${id}`, {
        method: 'PATCH',
        body: payload
      });
      await fetchRoles();
      return role;
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error actualizando el rol';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function deleteRole(id: string) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      await api(`/api/v1/admin/roles/${id}`, {
        method: 'DELETE'
      });
      await fetchRoles();
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error eliminando el rol';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reemplaza por completo el conjunto de roles del usuario (PUT, no PATCH):
   * el backend borra los actuales y guarda los recibidos dentro de una
   * transacción. Una lista vacía deja al usuario sin roles, y eso es válido.
   * El campo del body es `role_ids` (snake_case), tal como lo declara AssignRolesDto.
   */
  async function assignRolesToUser(userId: string, roleIds: string[]) {
    loading.value = true;
    error.value = null;
    try {
      const api = useApi();
      await api(`/api/v1/admin/users/${userId}/roles`, {
        method: 'PUT',
        body: { role_ids: roleIds }
      });
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error asignando los roles';
      throw e;
    } finally {
      loading.value = false;
    }
  }

  return {
    roles,
    loading,
    error,
    fetchRoles,
    createRole,
    updateRole,
    deleteRole,
    assignRolesToUser
  };
});
