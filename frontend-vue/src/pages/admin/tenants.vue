<template>
  <div>
    <div class="sm:flex sm:items-center">
      <div class="sm:flex-auto">
        <h1 class="text-xl font-semibold text-gray-900">Empresas (Tenants)</h1>
        <p class="mt-2 text-sm text-gray-700">Lista de clientes B2B con sus esquemas y planes activos.</p>
      </div>
      <div class="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
        <button
          @click="isModalOpen = true"
          type="button"
          class="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:w-auto"
        >
          Añadir Empresa
        </button>
      </div>
    </div>

    <!-- Error message -->
    <div v-if="error" class="mt-4 p-4 text-sm text-red-700 bg-red-100 rounded-md">
      {{ error }}
    </div>

    <!-- Table -->
    <div class="mt-8 flex flex-col">
      <div class="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
        <div class="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
          <div class="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
            <table class="min-w-full divide-y divide-gray-300">
              <thead class="bg-gray-50">
                <tr>
                  <th scope="col" class="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">Nombre Comercial</th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Subdominio / Esquema</th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Estado</th>
                  <th scope="col" class="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Registro</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200 bg-white">
                <tr v-if="loading && tenants.length === 0">
                  <td colspan="4" class="py-4 text-center text-sm text-gray-500">Cargando...</td>
                </tr>
                <tr v-else-if="tenants.length === 0">
                  <td colspan="4" class="py-4 text-center text-sm text-gray-500">No hay empresas registradas.</td>
                </tr>
                <tr v-for="tenant in tenants" :key="tenant.id">
                  <td class="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">{{ tenant.commercialName }}</td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{{ tenant.subdomain }}</td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span
                      class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                      :class="{
                        'bg-green-100 text-green-800': tenant.status === 'ACTIVE',
                        'bg-red-100 text-red-800': tenant.status === 'SUSPENDED',
                        'bg-yellow-100 text-yellow-800': tenant.status === 'GRACE_PERIOD'
                      }"
                    >
                      {{ tenant.status }}
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{{ new Date(tenant.createdAt).toLocaleDateString() }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal (Simplified MVP) -->
    <div v-if="isModalOpen" class="relative z-10" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-lg bg-white px-4 pt-5 pb-4 text-left shadow-xl transition-all sm:my-8 sm:w-full sm:max-w-lg sm:p-6">
            <h3 class="text-lg font-medium leading-6 text-gray-900" id="modal-title">Registrar Nueva Empresa</h3>
            <form @submit.prevent="handleCreate">
              <div class="mt-4 space-y-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700">Nombre Comercial</label>
                  <input type="text" v-model="form.name" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">Subdominio (Esquema BD)</label>
                  <input type="text" v-model="form.subdomain" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700">ID del Plan</label>
                  <input type="text" v-model="form.subscription_plan_id" required class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
              </div>
              <div class="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse">
                <button type="submit" :disabled="loading" class="inline-flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 sm:ml-3 sm:w-auto sm:text-sm">
                  {{ loading ? 'Creando...' : 'Crear y Aprovisionar' }}
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
import { useAdminTenantsStore } from '@/stores/admin/tenants'

definePageMeta({
  layout: 'admin',
})

const store = useAdminTenantsStore()
const { tenants, loading, error } = storeToRefs(store)

const isModalOpen = ref(false)
const form = ref({
  name: '',
  subdomain: '',
  subscription_plan_id: ''
})

onMounted(() => {
  store.fetchTenants()
})

const handleCreate = async () => {
  try {
    await store.createTenant({ ...form.value })
    isModalOpen.value = false
    form.value = { name: '', subdomain: '', subscription_plan_id: '' }
  } catch (e) {
    // Error is handled in store
  }
}
</script>
