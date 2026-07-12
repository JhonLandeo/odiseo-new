<template>
  <div class="role-editor bg-white p-6 rounded-lg shadow">
    <h2 class="text-xl font-bold mb-6">{{ isEditing ? 'Editar Rol' : 'Nuevo Rol' }}</h2>
    
    <form @submit.prevent="saveRole" class="space-y-6">
      <div class="grid gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700">Nombre del Rol</label>
          <input 
            v-model="formData.name" 
            type="text" 
            required
            :disabled="isSystemDefault"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          >
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700">Descripción</label>
          <textarea 
            v-model="formData.description"
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
          ></textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Heredar permisos de:</label>
          <select 
            v-model="formData.inheritedRoleIds" 
            multiple
            class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 h-24"
          >
            <option v-for="role in availableRolesToInherit" :key="role.id" :value="role.id">
              {{ role.name }}
            </option>
          </select>
          <p class="text-xs text-gray-500 mt-1">Mantén presionado Ctrl/Cmd para seleccionar varios.</p>
        </div>
      </div>

      <div class="border-t pt-6">
        <h3 class="text-lg font-medium mb-4">Permisos Granulares</h3>
        <div v-if="loadingPermissions" class="text-sm text-gray-500">Cargando permisos...</div>
        
        <div v-else class="space-y-6">
          <div v-for="group in permissionsMetadata" :key="group.module" class="bg-gray-50 p-4 rounded">
            <h4 class="font-semibold text-gray-700 mb-3">{{ group.module }}</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label 
                v-for="perm in group.permissions" 
                :key="perm.code"
                class="flex items-start space-x-3 cursor-pointer"
              >
                <input 
                  type="checkbox" 
                  :value="perm.code"
                  v-model="formData.permissions"
                  class="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                >
                <div>
                  <span class="block text-sm font-medium text-gray-900">{{ perm.code }}</span>
                  <span class="block text-xs text-gray-500">{{ perm.description }}</span>
                </div>
              </label>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-4">
        <button type="button" @click="$emit('cancel')" class="px-4 py-2 border rounded text-gray-700 hover:bg-gray-50">
          Cancelar
        </button>
        <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
          Guardar Rol
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRolesStore } from '../store/roles.store';
import type { Role } from '../types/roles.types';

const props = defineProps<{
  initialRole?: Role | null
}>();

const emit = defineEmits(['saved', 'cancel']);
const rolesStore = useRolesStore();

const isEditing = computed(() => !!props.initialRole);
const isSystemDefault = computed(() => props.initialRole?.isSystemDefault || false);

const formData = ref({
  name: props.initialRole?.name || '',
  description: props.initialRole?.description || '',
  permissions: props.initialRole?.permissions || [],
  inheritedRoleIds: props.initialRole?.inheritedRoles?.map(r => r.id) || []
});

const permissionsMetadata = ref<any[]>([]);
const loadingPermissions = ref(false);

const availableRolesToInherit = computed(() => {
  if (!rolesStore.roles) return [];
  // Cannot inherit from self
  return rolesStore.roles.filter(r => r.id !== props.initialRole?.id);
});

onMounted(async () => {
  loadingPermissions.value = true;
  try {
    const response = await fetch('/api/v1/admin/permissions', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const result = await response.json();
    permissionsMetadata.value = result.data;
  } finally {
    loadingPermissions.value = false;
  }
});

const saveRole = async () => {
  try {
    if (isEditing.value && props.initialRole) {
      await rolesStore.updateRole(props.initialRole.id, formData.value);
    } else {
      await rolesStore.createRole(formData.value);
    }
    emit('saved');
  } catch (err) {
    alert('Error al guardar el rol');
  }
};
</script>
