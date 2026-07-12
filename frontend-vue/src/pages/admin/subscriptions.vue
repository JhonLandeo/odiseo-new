<template>
  <div>
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-xl font-semibold text-gray-900">Planes de Suscripción</h1>
        <p class="mt-2 text-sm text-gray-700">Configuración de niveles comerciales y límites de consumo para el B2B.</p>
      </div>
      <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
        <button
          @click="isModalOpen = true"
          type="button"
          class="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
        >
          Crear Plan
        </button>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="mt-4 p-4 text-sm text-red-700 bg-red-100 rounded-md">
      {{ error }}
    </div>

    <!-- Grid -->
    <div class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <div v-if="loading && plans.length === 0" class="col-span-full py-12 text-center text-sm text-gray-500">
        Cargando planes...
      </div>
      <div v-else-if="plans.length === 0" class="col-span-full py-12 text-center text-sm text-gray-500">
        No hay planes configurados.
      </div>
      <div 
        v-for="plan in plans" 
        :key="plan.id" 
        class="overflow-hidden rounded-lg bg-white shadow ring-1 ring-black ring-opacity-5 flex flex-col"
      >
        <div class="p-6">
          <h3 class="text-lg font-medium text-gray-900">{{ plan.name }}</h3>
          <p class="mt-4 flex items-baseline text-3xl font-bold tracking-tight text-gray-900">
            ${{ plan.price }}
            <span class="ml-1 text-sm font-medium tracking-normal text-gray-500">/mes</span>
          </p>
          <ul class="mt-6 space-y-4 text-sm leading-6 text-gray-600">
            <li class="flex gap-x-3">
              <!-- check icon -->
              <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" /></svg>
              Hasta {{ plan.maxUsers }} usuarios admin
            </li>
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" /></svg>
              {{ plan.maxPdfPagesPerMonth }} págs de PDF / mes
            </li>
            <li class="flex gap-x-3">
              <svg class="h-6 w-5 flex-none text-indigo-600" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clip-rule="evenodd" /></svg>
              {{ plan.maxQuestionsPerMonth }} preguntas / mes
            </li>
          </ul>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="isModalOpen" class="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900">Crear Plan de Suscripción</h3>
            <form @submit.prevent="handleCreate">
              <div class="mt-4 grid grid-cols-2 gap-4">
                <div class="col-span-2">
                  <label class="block text-sm font-medium text-gray-700">Nombre del Plan</label>
                  <input type="text" v-model="form.name" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div class="col-span-1">
                  <label class="block text-sm font-medium text-gray-700">Precio</label>
                  <input type="number" v-model="form.price" required min="0" step="0.01" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div class="col-span-1">
                  <label class="block text-sm font-medium text-gray-700">Usuarios Max</label>
                  <input type="number" v-model="form.max_users" required min="1" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div class="col-span-1">
                  <label class="block text-sm font-medium text-gray-700">PDF Págs/mes</label>
                  <input type="number" v-model="form.max_pdf_pages_per_month" required min="0" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div class="col-span-1">
                  <label class="block text-sm font-medium text-gray-700">Preguntas/mes</label>
                  <input type="number" v-model="form.max_questions_per_month" required min="0" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
              </div>
              <div class="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
                <button type="submit" :disabled="loading" class="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm">
                  {{ loading ? 'Creando...' : 'Crear Plan' }}
                </button>
                <button type="button" @click="isModalOpen = false" class="mt-3 inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-base font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:mt-0 sm:w-auto sm:text-sm">
                  Cancelar
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
