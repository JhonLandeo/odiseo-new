import { defineStore } from 'pinia';
import { ref } from 'vue';
import { useAuthStore } from '../../../stores/auth.store';
import type { Role, CreateRoleDto, UpdateRoleDto } from '../types/roles.types';

export const useRolesStore = defineStore('roles', () => {
  const roles = ref<Role[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchRoles() {
    loading.value = true;
    try {
      // Roles are tenant-scoped: the backend resolves the tenant from the
      // subdomain, which the browser host does not carry on localhost.
      // Authentication itself travels in an httpOnly cookie, not a header.
      const authStore = useAuthStore();
      const response = await fetch('/api/v1/admin/roles', {
        headers: { 'x-subdomain': authStore.getSubdomain() }
      });
      const result = await response.json();
      roles.value = result.data;
    } catch (err: any) {
      error.value = err.message;
    } finally {
      loading.value = false;
    }
  }

  async function createRole(payload: CreateRoleDto) {
    // ... API call implementation
  }

  async function updateRole(id: string, payload: UpdateRoleDto) {
    // ... API call implementation
  }

  async function deleteRole(id: string) {
    // ... API call implementation
  }

  return { roles, loading, error, fetchRoles, createRole, updateRole, deleteRole };
});
