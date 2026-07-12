<template>
  <div class="roles-list">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold">Roles y Permisos</h1>
      <button @click="$emit('create')" class="bg-blue-600 text-white px-4 py-2 rounded">
        Crear Rol
      </button>
    </div>

    <div v-if="loading" class="text-center py-4">Cargando roles...</div>
    <div v-else-if="error" class="text-red-500">{{ error }}</div>
    
    <div v-else class="grid gap-4">
      <div v-for="role in roles" :key="role.id" class="border rounded-lg p-4 bg-white shadow-sm flex justify-between items-center">
        <div>
          <h3 class="font-semibold text-lg flex items-center gap-2">
            {{ role.name }}
            <span v-if="role.isSystemDefault" class="text-xs bg-gray-200 px-2 py-1 rounded text-gray-700">
              Defecto
            </span>
          </h3>
          <p class="text-gray-600 text-sm mt-1">{{ role.description || 'Sin descripción' }}</p>
          <div class="mt-2 text-xs text-gray-500">
            <span v-if="role.inheritedRoles?.length">
              Hereda de: {{ role.inheritedRoles.map(r => r.name).join(', ') }}
            </span>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button @click="$emit('edit', role)" class="text-blue-600 hover:bg-blue-50 px-3 py-1 rounded">
            Editar
          </button>
          <button 
            v-if="!role.isSystemDefault" 
            @click="deleteRole(role.id)" 
            class="text-red-600 hover:bg-red-50 px-3 py-1 rounded">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { storeToRefs } from 'pinia';
import { useRolesStore } from '../store/roles.store';

const emit = defineEmits(['create', 'edit']);
const rolesStore = useRolesStore();
const { roles, loading, error } = storeToRefs(rolesStore);

onMounted(() => {
  rolesStore.fetchRoles();
});

const deleteRole = async (id: string) => {
  if (confirm('¿Estás seguro de eliminar este rol?')) {
    await rolesStore.deleteRole(id);
    rolesStore.fetchRoles(); // refresh
  }
};
</script>
