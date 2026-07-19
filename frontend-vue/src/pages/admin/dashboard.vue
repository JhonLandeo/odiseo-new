<template>
  <div class="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header Section -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-chart-bar-square" class="w-7 h-7 text-indigo-500" />
          Métricas de Consumo
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Supervisión de infraestructura y recursos globales de Odiseo SaaS.
        </p>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/30 dark:text-rose-400 rounded-xl flex items-center gap-3">
      <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 shrink-0" />
      {{ error }}
    </div>

    <!-- Filters Box -->
    <div class="relative overflow-hidden bg-white/60 dark:bg-[#2b2b3f]/60 backdrop-blur-xl p-5 rounded-2xl border border-slate-200/60 dark:border-slate-700/50 shadow-sm flex flex-col sm:flex-row gap-4 items-end">
      <!-- Decorator -->
      <div class="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
      
      <div class="w-full sm:w-72 relative z-10">
        <label class="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">Tenant Analizado</label>
        <div class="relative">
          <select 
            v-model="selectedTenantId" 
            class="block w-full appearance-none rounded-xl border border-slate-300 dark:border-slate-600 bg-white/50 dark:bg-slate-800/50 py-2.5 pl-4 pr-10 text-sm font-medium text-slate-700 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
          >
            <option value="all">🌐 Consolidado Global (Todos)</option>
            <option v-for="tenant in tenantsLite" :key="tenant.id" :value="tenant.id">🏢 {{ tenant.commercialName }}</option>
          </select>
          <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
            <UIcon name="i-heroicons-chevron-up-down" class="w-4 h-4" />
          </div>
        </div>
      </div>
      
      <button 
        @click="loadMetrics" 
        class="w-full sm:w-auto relative z-10 group flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20"
      >
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 transition-transform group-hover:rotate-180 duration-500" />
        Actualizar Datos
      </button>
    </div>

    <!-- Bento Grid Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      
      <!-- Users Metric -->
      <div class="relative overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm hover:shadow-md transition-shadow group">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-blue-500/10 dark:bg-blue-500/20 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400">
            <UIcon name="i-heroicons-users" class="w-6 h-6" />
          </div>
          <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Usuarios Activos</span>
        </div>
        <div class="relative z-10 flex items-baseline gap-2">
          <span class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {{ loading ? '...' : (metrics?.active_users || 0) }}
          </span>
        </div>
      </div>

      <!-- PDF Pages Metric -->
      <div class="relative overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm hover:shadow-md transition-shadow group">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-purple-500/10 dark:bg-purple-500/20 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center border border-purple-100 dark:border-purple-500/20 text-purple-600 dark:text-purple-400">
            <UIcon name="i-heroicons-document-text" class="w-6 h-6" />
          </div>
          <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Páginas Generadas</span>
        </div>
        <div class="relative z-10 flex items-baseline gap-2">
          <span class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {{ loading ? '...' : (metrics?.pdf_pages_generated || 0) }}
          </span>
        </div>
      </div>

      <!-- Questions Used -->
      <div class="relative overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm hover:shadow-md transition-shadow group">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/20 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center border border-emerald-100 dark:border-emerald-500/20 text-emerald-600 dark:text-emerald-400">
            <UIcon name="i-heroicons-academic-cap" class="w-6 h-6" />
          </div>
          <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Preguntas Usadas</span>
        </div>
        <div class="relative z-10 flex items-baseline gap-2">
          <span class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {{ loading ? '...' : (metrics?.questions_used || 0) }}
          </span>
        </div>
      </div>

      <!-- Storage Metric -->
      <div class="relative overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-6 shadow-sm hover:shadow-md transition-shadow group">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-amber-500/10 dark:bg-amber-500/20 rounded-full blur-2xl group-hover:scale-110 transition-transform"></div>
        <div class="flex items-center gap-4 mb-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center border border-amber-100 dark:border-amber-500/20 text-amber-600 dark:text-amber-400">
            <UIcon name="i-heroicons-server-stack" class="w-6 h-6" />
          </div>
          <span class="text-sm font-medium text-slate-600 dark:text-slate-400">Almacenamiento (MB)</span>
        </div>
        <div class="relative z-10 flex items-baseline gap-2">
          <span class="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
            {{ loading ? '...' : (metrics?.storage_mb || 0) }}
          </span>
          <span class="text-sm text-slate-400 font-medium">MB</span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminDashboardStore } from '@/stores/admin/dashboard'
import { useAdminTenantsStore } from '@/stores/admin/tenants'

definePageMeta({
  layout: 'admin',
})

const store = useAdminDashboardStore()
const { metrics, loading, error } = storeToRefs(store)
const selectedTenantId = ref('all')

const tenantsStore = useAdminTenantsStore()
const { tenantsLite } = storeToRefs(tenantsStore)

const loadMetrics = () => {
  store.fetchMetrics(selectedTenantId.value)
}

onMounted(() => {
  // The full active-tenant set, not a page: this filter must offer every
  // tenant regardless of how many exist (see tenants.store.ts tenantsLite).
  tenantsStore.fetchTenantsLite()
  loadMetrics()
})
</script>
