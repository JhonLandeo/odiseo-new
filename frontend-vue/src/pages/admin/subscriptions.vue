<template>
  <div class="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-credit-card" class="w-7 h-7 text-indigo-500" />
          Planes de Suscripción
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Configuración de niveles comerciales y límites de consumo para clientes B2B.
        </p>
      </div>
      <button
        @click="isModalOpen = true"
        class="group flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 shrink-0"
      >
        <UIcon name="i-heroicons-plus" class="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" />
        Crear Plan
      </button>
    </div>

    <!-- Error message -->
    <div v-if="error" class="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/30 dark:text-rose-400 rounded-xl flex items-center gap-3">
      <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 shrink-0" />
      {{ error }}
    </div>

    <!-- Grid -->
    <div class="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
      <div v-if="loading && plans.length === 0" class="col-span-full py-20 flex flex-col items-center justify-center text-slate-500">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <span class="text-sm font-medium">Cargando planes...</span>
      </div>
      
      <div v-else-if="plans.length === 0" class="col-span-full py-20 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl bg-slate-50 dark:bg-[#2b2b3f]/50">
        <UIcon name="i-heroicons-archive-box-x-mark" class="w-12 h-12 mb-4 text-slate-400 dark:text-slate-500" />
        <span class="text-base font-medium">No hay planes configurados.</span>
      </div>

      <!-- Plan Card -->
      <div 
        v-for="plan in plans" 
        :key="plan.id" 
        class="relative overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 shadow-sm hover:shadow-xl transition-all duration-300 group flex flex-col"
      >
        <!-- Decorator glow -->
        <div class="absolute -right-10 -top-10 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-colors pointer-events-none"></div>
        
        <div class="p-8 relative z-10 flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-xl font-bold text-slate-900 dark:text-white">{{ plan.name }}</h3>
            <div class="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5" />
            </div>
          </div>
          
          <div class="mb-6">
            <p class="flex items-baseline text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              ${{ plan.price }}
              <span class="ml-1 text-sm font-medium tracking-normal text-slate-500 dark:text-slate-400">/mes</span>
            </p>
          </div>

          <div class="w-full h-px bg-slate-200 dark:bg-slate-700/50 mb-6"></div>
          
          <ul class="space-y-4 text-sm leading-6 text-slate-600 dark:text-slate-300 flex-1">
            <li class="flex items-center gap-x-3">
              <div class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              Hasta {{ plan.maxUsers }} usuarios admin
            </li>
            <li class="flex items-center gap-x-3">
              <div class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              {{ plan.maxPdfPagesPerMonth }} págs de PDF / mes
            </li>
            <li class="flex items-center gap-x-3">
              <div class="w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
                <UIcon name="i-heroicons-check" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              {{ plan.maxQuestionsPerMonth }} preguntas / mes
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Create Modal (Premium Style) -->
    <div v-if="isModalOpen" class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-lg border border-slate-200 dark:border-slate-700/50">
            <div class="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700/50">
              <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2" id="modal-title">
                <UIcon name="i-heroicons-plus-circle" class="w-6 h-6 text-indigo-500" />
                Crear Plan de Suscripción
              </h3>
            </div>
            <form @submit.prevent="handleCreate" class="px-6 py-4">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre del Plan</label>
                  <input type="text" v-model="form.name" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Precio ($)</label>
                    <input type="number" v-model="form.price" required min="0" step="0.01" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Usuarios Max</label>
                    <input type="number" v-model="form.max_users" required min="1" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">PDF Págs/mes</label>
                    <input type="number" v-model="form.max_pdf_pages_per_month" required min="0" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Preguntas/mes</label>
                    <input type="number" v-model="form.max_questions_per_month" required min="0" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                </div>
              </div>
              <div class="mt-8 flex items-center justify-end gap-3">
                <button type="button" @click="isModalOpen = false" class="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" :disabled="loading" class="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50">
                  <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                  {{ loading ? 'Creando...' : 'Crear Plan' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminSubscriptionsStore } from '@/stores/admin/subscriptions'

definePageMeta({
  layout: 'admin',
})

const store = useAdminSubscriptionsStore()
const { plans, loading, error } = storeToRefs(store)

const isModalOpen = ref(false)
const form = ref({
  name: '',
  price: 0,
  max_users: 5,
  max_pdf_pages_per_month: 100,
  max_questions_per_month: 500
})

onMounted(() => {
  store.fetchPlans()
})

const handleCreate = async () => {
  try {
    await store.createPlan({ ...form.value })
    isModalOpen.value = false
    form.value = {
      name: '',
      price: 0,
      max_users: 5,
      max_pdf_pages_per_month: 100,
      max_questions_per_month: 500
    }
  } catch (e) {
    // Error is handled in store
  }
}
</script>
