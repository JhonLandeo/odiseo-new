<template>
  <div class="user-management p-6">
    <h1 class="text-2xl font-bold mb-6">Gestión de Usuarios</h1>
    
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Roles Asignados</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="user in mockUsers" :key="user.id">
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="font-medium text-gray-900">{{ user.name }}</div>
              <div class="text-gray-500 text-sm">{{ user.email }}</div>
            </td>
            <td class="px-6 py-4">
              <div class="flex gap-2 flex-wrap">
                <span 
                  v-for="role in user.roles" 
                  :key="role.id"
                  class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                >
                  {{ role.name }}
                </span>
                <span v-if="!user.roles.length" class="text-gray-400 text-sm italic">Sin roles</span>
              </div>
            </td>
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
              <button 
                @click="openRoleModal(user)" 
                class="text-blue-600 hover:text-blue-900"
              >
                Gestionar Roles
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal de Asignación de Roles -->
    <div v-if="isModalOpen" class="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center">
      <div class="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
        <h3 class="text-lg font-bold mb-4">Asignar Roles a {{ selectedUser?.name }}</h3>
        
        <div class="space-y-3 max-h-60 overflow-y-auto mb-6">
          <label 
            v-for="role in availableRoles" 
            :key="role.id" 
            class="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-50 rounded"
          >
            <input 
              type="checkbox" 
              :value="role.id" 
              v-model="selectedRoleIds"
              class="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            >
            <span class="text-gray-900 font-medium">{{ role.name }}</span>
          </label>
        </div>

        <div class="flex justify-end gap-3 mt-6 border-t pt-4">
          <button @click="closeModal" class="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">
            Cancelar
          </button>
          <button @click="saveRoles" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Guardar Cambios
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRolesStore } from '../store/roles.store';
import { storeToRefs } from 'pinia';

// Mock data to demonstrate integration without full user module dependency
const mockUsers = ref([
  { id: '1', name: 'Ana Garcia', email: 'ana@colegio.edu', roles: [] as any[] },
  { id: '2', name: 'Carlos Ruiz', email: 'carlos@colegio.edu', roles: [] as any[] },
]);

const rolesStore = useRolesStore();
const { roles: availableRoles } = storeToRefs(rolesStore);

const isModalOpen = ref(false);
const selectedUser = ref<any>(null);
const selectedRoleIds = ref<string[]>([]);

onMounted(() => {
  rolesStore.fetchRoles();
  // Idealmente aquí se llamaría a fetchUsers() de un userStore
});

const openRoleModal = (user: any) => {
  selectedUser.value = user;
  selectedRoleIds.value = user.roles.map((r: any) => r.id);
  isModalOpen.value = true;
};

const closeModal = () => {
  isModalOpen.value = false;
  selectedUser.value = null;
  selectedRoleIds.value = [];
};

const saveRoles = async () => {
  if (!selectedUser.value) return;
  
  try {
    const response = await fetch(`/api/v1/admin/users/${selectedUser.value.id}/roles`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({ role_ids: selectedRoleIds.value })
    });
    
    if (response.ok) {
      // Optimistic update
      selectedUser.value.roles = availableRoles.value.filter(r => selectedRoleIds.value.includes(r.id));
      closeModal();
    }
  } catch (err) {
    alert('Error al asignar roles');
  }
};
</script>
