<template>
  <div>
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-xl font-semibold text-gray-900">Dashboard de Consumo e Infraestructura</h1>
        <p class="mt-2 text-sm text-gray-700">Métricas consolidadas de uso de recursos por empresa (Tenant).</p>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="mt-4 p-4 text-sm text-red-700 bg-red-100 rounded-md">
      {{ error }}
    </div>

    <!-- Filters (Mock) -->
    <div class="mt-6 flex gap-4 items-end bg-white p-4 rounded-lg shadow-sm border border-gray-100">
      <div class="w-64">
        <label class="block text-sm font-medium text-gray-700">Seleccionar Tenant</label>
        <select v-model="selectedTenantId" class="mt-1 block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-indigo-500 focus:outline-none focus:ring-indigo-500 sm:text-sm border">
          <option value="all">Consolidado Global (Mock)</option>
          <!-- <option v-for="tenant in tenants" :value="tenant.id">{{ tenant.commercialName }}</option> -->
        </select>
      </div>
      <button @click="loadMetrics" class="bg-indigo-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-indigo-700">Actualizar</button>
    </div>

    <!-- Stats -->
    <dl class="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6">
        <dt>
          <div class="absolute rounded-md bg-indigo-500 p-3">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p class="ml-16 truncate text-sm font-medium text-gray-500">Usuarios Activos</p>
        </dt>
        <dd class="ml-16 flex items-baseline pb-6 sm:pb-7">
          <p class="text-2xl font-semibold text-gray-900">{{ loading ? '...' : (metrics?.active_users || 0) }}</p>
        </dd>
      </div>

      <div class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6">
        <dt>
          <div class="absolute rounded-md bg-indigo-500 p-3">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <p class="ml-16 truncate text-sm font-medium text-gray-500">Páginas de PDF</p>
        </dt>
        <dd class="ml-16 flex items-baseline pb-6 sm:pb-7">
          <p class="text-2xl font-semibold text-gray-900">{{ loading ? '...' : (metrics?.pdf_pages_generated || 0) }}</p>
        </dd>
      </div>

      <div class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6">
        <dt>
          <div class="absolute rounded-md bg-indigo-500 p-3">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </div>
          <p class="ml-16 truncate text-sm font-medium text-gray-500">Preguntas Usadas</p>
        </dt>
        <dd class="ml-16 flex items-baseline pb-6 sm:pb-7">
          <p class="text-2xl font-semibold text-gray-900">{{ loading ? '...' : (metrics?.questions_used || 0) }}</p>
        </dd>
      </div>

      <div class="relative overflow-hidden rounded-lg bg-white px-4 pt-5 pb-12 shadow sm:px-6 sm:pt-6">
        <dt>
          <div class="absolute rounded-md bg-indigo-500 p-3">
            <svg class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
            </svg>
          </div>
          <p class="ml-16 truncate text-sm font-medium text-gray-500">Almacenamiento (MB)</p>
        </dt>
        <dd class="ml-16 flex items-baseline pb-6 sm:pb-7">
          <p class="text-2xl font-semibold text-gray-900">{{ loading ? '...' : (metrics?.storage_mb || 0) }}</p>
        </dd>
      </div>
    </dl>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminDashboardStore } from '@/stores/admin/dashboard'

definePageMeta({
  layout: 'admin',
})

const store = useAdminDashboardStore()
const { metrics, loading, error } = storeToRefs(store)
const selectedTenantId = ref('all')

const loadMetrics = () => {
  store.fetchMetrics(selectedTenantId.value)
}

onMounted(() => {
  loadMetrics()
})
</script>
