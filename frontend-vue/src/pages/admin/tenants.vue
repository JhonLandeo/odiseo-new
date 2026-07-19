<template>
  <div class="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
          <UIcon name="i-heroicons-building-office-2" class="w-7 h-7 text-indigo-500" />
          Gestión de Empresas (Tenants)
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Supervisión de clientes B2B, aprovisionamiento de esquemas y planes activos.
        </p>
      </div>
      <button
        @click="isModalOpen = true"
        class="group flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 shrink-0"
      >
        <UIcon name="i-heroicons-plus" class="w-5 h-5 transition-transform group-hover:rotate-90 duration-300" />
        Añadir Empresa
      </button>
    </div>

    <!-- Error message -->
    <div v-if="error" class="p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-900/20 dark:border-rose-800/30 dark:text-rose-400 rounded-xl flex items-center gap-3">
      <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 shrink-0" />
      {{ error }}
    </div>

    <!-- Table Container -->
    <div class="bg-white dark:bg-[#2b2b3f] rounded-3xl border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700/50">
          <thead class="bg-slate-50 dark:bg-[#1e1e2d]/50">
            <tr>
              <th scope="col" class="py-4 pl-6 pr-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nombre Comercial</th>
              <th scope="col" class="px-3 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subdominio / Esquema</th>
              <th scope="col" class="px-3 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Estado</th>
              <th scope="col" class="px-3 py-4 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Registro</th>
              <th scope="col" class="relative py-4 pl-3 pr-6 sm:pr-0">
                <span class="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700/50 bg-white dark:bg-[#2b2b3f]">
            <!-- Skeleton Loader -->
            <template v-if="loading || isFirstLoad">
              <tr v-for="i in 3" :key="i" class="animate-pulse">
                <td class="whitespace-nowrap py-4 pl-6 pr-3 flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-slate-200/60 dark:bg-slate-800 shrink-0"></div>
                  <div class="space-y-2">
                    <div class="h-4 w-32 bg-slate-200/60 dark:bg-slate-800 rounded-md"></div>
                    <div class="h-3 w-48 bg-slate-200/60 dark:bg-slate-800 rounded-md"></div>
                  </div>
                </td>
                <td class="whitespace-nowrap px-3 py-4">
                  <div class="h-6 w-20 bg-slate-200/60 dark:bg-slate-800 rounded-md"></div>
                </td>
                <td class="whitespace-nowrap px-3 py-4">
                  <div class="h-5 w-16 bg-slate-200/60 dark:bg-slate-800 rounded-full"></div>
                </td>
                <td class="whitespace-nowrap px-3 py-4">
                  <div class="h-4 w-24 bg-slate-200/60 dark:bg-slate-800 rounded-md"></div>
                </td>
                <td class="whitespace-nowrap py-4 pl-3 pr-6 text-right">
                  <div class="flex justify-end gap-2 pr-6">
                    <div class="w-8 h-8 bg-slate-200/60 dark:bg-slate-800 rounded-lg"></div>
                    <div class="w-8 h-8 bg-slate-200/60 dark:bg-slate-800 rounded-lg"></div>
                    <div class="w-8 h-8 bg-slate-200/60 dark:bg-slate-800 rounded-lg"></div>
                  </div>
                </td>
              </tr>
            </template>

            <!-- Empty State -->
            <tr v-else-if="tenants.length === 0">
              <td colspan="5" class="py-12 text-center text-sm text-slate-500">
                <UIcon name="i-heroicons-inbox" class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p class="font-semibold text-slate-600 dark:text-slate-400">No hay empresas registradas.</p>
                <p class="text-xs text-slate-400 mt-1">Usa el botón superior para crear y aprovisionar un nuevo inquilino.</p>
              </td>
            </tr>
             <tr v-for="tenant in tenants" :key="tenant.id" class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
               <td class="whitespace-nowrap py-4 pl-6 pr-3 text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                 <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                   {{ tenant.commercialName.substring(0, 2).toUpperCase() }}
                 </div>
                 <div>
                   <div class="font-semibold text-slate-900 dark:text-white">{{ tenant.commercialName }}</div>
                 </div>
               </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-600 dark:text-slate-300 font-mono">
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 w-max border border-slate-200 dark:border-slate-700">
                  <UIcon name="i-heroicons-server" class="w-3.5 h-3.5 text-slate-400" />
                  {{ tenant.subdomain }}
                </div>
              </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm">
                <span
                  class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                  :class="{
                    'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20': tenant.status === 'ACTIVE',
                    'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20': tenant.status === 'SUSPENDED',
                    'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20': tenant.status === 'GRACE_PERIOD'
                  }"
                >
                  <span class="w-1.5 h-1.5 rounded-full" 
                        :class="tenant.status === 'ACTIVE' ? 'bg-emerald-500' : (tenant.status === 'SUSPENDED' ? 'bg-rose-500' : 'bg-amber-500')">
                  </span>
                  {{ tenant.status?.toUpperCase() || 'ACTIVE' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-3 py-4 text-sm text-slate-500 dark:text-slate-400">
                {{ new Date(tenant.createdAt).toLocaleDateString() }}
              </td>
              <td class="relative whitespace-nowrap py-4 pl-3 pr-6 text-right text-sm font-medium flex items-center justify-end gap-2">
                <button @click="openAdminsModal(tenant.id)" class="text-amber-600 dark:text-amber-400 hover:text-amber-900 dark:hover:text-amber-300 p-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors" title="Gestionar Administradores">
                  <UIcon name="i-heroicons-users" class="w-5 h-5" />
                </button>
                <button @click="openEditModal(tenant)" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors" title="Editar Empresa">
                  <UIcon name="i-heroicons-pencil-square" class="w-5 h-5" />
                </button>
                <button v-if="tenant.status === 'ACTIVE'" @click="confirmSuspend(tenant.id)" class="text-rose-600 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors" title="Suspender / Dar de baja">
                  <UIcon name="i-heroicons-no-symbol" class="w-5 h-5" />
                </button>
                <button v-else @click="handleActivate(tenant.id)" class="text-emerald-600 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-300 p-1.5 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors" title="Reactivar">
                  <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pager -->
      <div
        v-if="!(loading || isFirstLoad) && tenants.length > 0"
        class="flex items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-700/50 px-6 py-4"
      >
        <p class="text-xs text-slate-500 dark:text-slate-400">
          Página {{ page }} de {{ totalPages }}
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            :disabled="page <= 1"
            @click="goToPage(page - 1)"
            class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            Anterior
          </button>
          <button
            type="button"
            :disabled="page >= totalPages"
            @click="goToPage(page + 1)"
            class="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>

    <!-- Create Modal (Premium Style) -->
    <div v-if="isModalOpen" class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-200 dark:border-slate-700/50">
            <div class="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700/50">
              <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2" id="modal-title">
                <UIcon name="i-heroicons-building-office" class="w-6 h-6 text-indigo-500" />
                Registrar Nueva Empresa
              </h3>
            </div>
            <form @submit.prevent="handleCreate" class="px-6 py-4">
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre Comercial</label>
                  <input type="text" v-model="form.name" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo del Administrador (B2B)</label>
                  <input type="email" v-model="form.adminEmail" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="director@colegio.edu" />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Contraseña Temporal</label>
                  <input type="text" v-model="form.adminPassword" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Subdominio (Esquema BD)</label>
                  <div class="flex relative">
                    <input type="text" v-model="form.subdomain" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all pr-32" />
                    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-slate-400 font-mono text-sm">
                      .odiseo.edu
                    </div>
                  </div>
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Plan de Suscripción</label>
                  <select v-model="form.subscription_plan_id" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                    <option value="" disabled selected>Selecciona un plan...</option>
                    <option v-for="plan in subscriptionPlans" :key="plan.id" :value="plan.id">
                      {{ plan.name }} - ${{ plan.price }}/mes
                    </option>
                  </select>
                </div>

                <!-- Collapsible More Options -->
                <div class="pt-2 border-t border-slate-100 dark:border-slate-800/50">
                  <button 
                    type="button" 
                    @click="showMoreOptions = !showMoreOptions" 
                    class="flex items-center gap-1.5 text-xs font-bold text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none transition-colors"
                  >
                    <UIcon :name="showMoreOptions ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-4 h-4" />
                    {{ showMoreOptions ? 'Ocultar opciones adicionales' : 'Mostrar opciones adicionales (opcionales)' }}
                  </button>
                  
                  <div v-show="showMoreOptions" class="mt-4 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo de Contacto</label>
                        <input type="email" v-model="form.contactEmail" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                      </div>
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                        <input type="text" v-model="form.phone" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                      </div>
                      <div>
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">RUC / NIT</label>
                        <input type="text" v-model="form.taxId" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                      </div>
                      <div class="sm:col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Dirección</label>
                        <input type="text" v-model="form.address" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                      </div>
                      <div class="sm:col-span-2">
                        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">URL del Logo</label>
                        <input type="url" v-model="form.logoUrl" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="https://..." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="mt-8 flex items-center justify-end gap-3">
                <button type="button" @click="isModalOpen = false" class="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" :disabled="loading" class="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50">
                  <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                  {{ loading ? 'Creando...' : 'Crear y Aprovisionar' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal (Premium Style) -->
    <div v-if="isEditModalOpen" class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-200 dark:border-slate-700/50">
            <div class="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700/50">
              <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2" id="modal-title">
                <UIcon name="i-heroicons-pencil-square" class="w-6 h-6 text-indigo-500" />
                Editar Empresa
              </h3>
            </div>
            <form @submit.prevent="handleEditSubmit" class="px-6 py-4">
              <div class="space-y-4">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre Comercial</label>
                    <input type="text" v-model="editForm.commercialName" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-400 dark:text-slate-500 mb-1">Subdominio (No editable)</label>
                    <div class="flex relative">
                      <input type="text" :value="editForm.subdomain" disabled class="w-full rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-900/50 px-4 py-2 text-slate-400 dark:text-slate-500 outline-none cursor-not-allowed pr-32 font-mono" />
                      <div class="absolute inset-y-0 right-0 flex items-center pr-4 pointer-events-none text-slate-400 dark:text-slate-500 font-mono text-sm">
                        .odiseo.edu
                      </div>
                    </div>
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-400 dark:text-slate-500 mb-1">Correo de Acceso / Login (No editable)</label>
                    <div class="relative">
                      <input type="text" :value="editForm.adminEmail" disabled class="w-full rounded-xl border border-slate-200 dark:border-slate-700/50 bg-slate-100 dark:bg-slate-900/50 px-4 py-2 text-slate-400 dark:text-slate-500 outline-none cursor-not-allowed" />
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo de Contacto</label>
                    <input type="email" v-model="editForm.contactEmail" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Teléfono</label>
                    <input type="text" v-model="editForm.phone" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">RUC / NIT</label>
                    <input type="text" v-model="editForm.taxId" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                  </div>
                  <div>
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Plan de Suscripción</label>
                    <select v-model="editForm.subscription_plan_id" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer">
                      <option v-for="plan in subscriptionPlans" :key="plan.id" :value="plan.id">
                        {{ plan.name }}
                      </option>
                    </select>
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Dirección</label>
                    <input type="text" v-model="editForm.address" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="opcional" />
                  </div>
                  <div class="sm:col-span-2">
                    <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">URL del Logo</label>
                    <input type="url" v-model="editForm.logoUrl" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" placeholder="https://..." />
                  </div>
                </div>
              </div>
              <div class="mt-8 flex items-center justify-end gap-3">
                <button type="button" @click="isEditModalOpen = false" class="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="submit" :disabled="loading" class="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-indigo-500/20 disabled:opacity-50">
                  <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                  {{ loading ? 'Guardando...' : 'Guardar Cambios' }}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
    <!-- Manage Tenant Admins Modal -->
    <TenantAdminsModal v-model:isOpen="isAdminsModalOpen" :tenantId="selectedTenantId" />


    <!-- Confirm Suspend Modal -->
    <div v-if="isConfirmSuspendModalOpen" class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"></div>
      <div class="fixed inset-0 z-10 overflow-y-auto">
        <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
          <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-md border border-slate-200 dark:border-slate-700/50">
            <div class="px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700/50">
              <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2" id="modal-title">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-rose-500" />
                Confirmar Suspensión
              </h3>
            </div>
            <div class="px-6 py-4">
              <p class="text-sm text-slate-500 dark:text-slate-400">
                ¿Estás seguro de que deseas suspender/dar de baja a esta empresa? Los usuarios vinculados a este subdominio no podrán ingresar al sistema.
              </p>
              <div class="mt-6 flex items-center justify-end gap-3">
                <button type="button" @click="isConfirmSuspendModalOpen = false" class="px-5 py-2.5 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                  Cancelar
                </button>
                <button type="button" @click="handleSuspendSubmit" :disabled="loading" class="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-rose-500/20 disabled:opacity-50">
                  <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                  Sí, suspender
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAdminTenantsStore } from '@/stores/admin/tenants'
import { useAdminSubscriptionsStore } from '@/stores/admin/subscriptions'
import { useToast } from '#imports'
import TenantAdminsModal from '@/components/admin/TenantAdminsModal.vue'

definePageMeta({
  layout: 'admin',
})

const tenantsStore = useAdminTenantsStore()
const { tenants, loading, error, total, page, pageSize } = storeToRefs(tenantsStore)

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))

const goToPage = async (targetPage: number) => {
  if (targetPage < 1 || targetPage > totalPages.value) return
  await tenantsStore.fetchTenants({ page: targetPage, pageSize: pageSize.value })
}

const subscriptionsStore = useAdminSubscriptionsStore()
const { plans: subscriptionPlans } = storeToRefs(subscriptionsStore)

const toast = useToast()

const isModalOpen = ref(false)
const showMoreOptions = ref(false)
const form = ref({
  name: '',
  subdomain: '',
  subscription_plan_id: '',
  adminEmail: '',
  adminPassword: 'Password123!',
  contactEmail: '',
  phone: '',
  address: '',
  taxId: '',
  logoUrl: ''
})

const isEditModalOpen = ref(false)
const editForm = ref({
  id: '',
  commercialName: '',
  subdomain: '',
  adminEmail: '',
  subscription_plan_id: '',
  contactEmail: '',
  phone: '',
  address: '',
  taxId: '',
  logoUrl: ''
})

const isAdminsModalOpen = ref(false)
const selectedTenantId = ref<string | null>(null)

const isConfirmSuspendModalOpen = ref(false)
const tenantToSuspend = ref<string | null>(null)
const isFirstLoad = ref(true)

onMounted(async () => {
  try {
    await Promise.all([
      tenantsStore.fetchTenants(),
      subscriptionsStore.fetchPlans()
    ])
  } finally {
    isFirstLoad.value = false
  }
})

const handleCreate = async () => {
  try {
    await tenantsStore.createTenant({ ...form.value })
    isModalOpen.value = false
    showMoreOptions.value = false
    form.value = { 
      name: '', 
      subdomain: '', 
      subscription_plan_id: '',
      adminEmail: '',
      adminPassword: 'Password123!',
      contactEmail: '',
      phone: '',
      address: '',
      taxId: '',
      logoUrl: ''
    }
    toast.add({ title: 'Empresa registrada', description: 'La empresa y su administrador fueron creados exitosamente.', color: 'green' })
  } catch (e) {
    // Error is handled in store
  }
}

const openEditModal = (tenant: any) => {
  editForm.value = {
    id: tenant.id,
    commercialName: tenant.commercialName,
    subdomain: tenant.subdomain,
    adminEmail: tenant.adminEmail || '',
    subscription_plan_id: tenant.subscriptionPlanId || tenant.subscriptionPlan?.id || '',
    contactEmail: tenant.contactEmail || '',
    phone: tenant.phone || '',
    address: tenant.address || '',
    taxId: tenant.taxId || '',
    logoUrl: tenant.logoUrl || ''
  }
  isEditModalOpen.value = true
}

const handleEditSubmit = async () => {
  try {
    await tenantsStore.updateTenant(editForm.value.id, {
      commercialName: editForm.value.commercialName,
      subscription_plan_id: editForm.value.subscription_plan_id,
      contactEmail: editForm.value.contactEmail,
      phone: editForm.value.phone,
      address: editForm.value.address,
      taxId: editForm.value.taxId,
      logoUrl: editForm.value.logoUrl
    })
    isEditModalOpen.value = false
    toast.add({ title: 'Empresa actualizada', description: 'Los cambios fueron guardados exitosamente.', color: 'green' })
  } catch (e) {
    // Error is handled in store
  }
}

const confirmSuspend = (id: string) => {
  tenantToSuspend.value = id
  isConfirmSuspendModalOpen.value = true
}

const handleSuspendSubmit = async () => {
  if (!tenantToSuspend.value) return
  try {
    await tenantsStore.updateTenantStatus(tenantToSuspend.value, 'SUSPENDED')
    toast.add({ title: 'Empresa suspendida', description: 'El tenant ha sido desactivado temporalmente.', color: 'red' })
  } catch (e) {
    // Error is handled in store
  } finally {
    isConfirmSuspendModalOpen.value = false
    tenantToSuspend.value = null
  }
}

const handleActivate = async (id: string) => {
  try {
    await tenantsStore.updateTenantStatus(id, 'ACTIVE')
    toast.add({ title: 'Empresa activada', description: 'El tenant ha sido reactivado exitosamente.', color: 'green' })
  } catch (e) {
    // Error is handled in store
  }
}

const openAdminsModal = (tenantId: string) => {
  selectedTenantId.value = tenantId
  isAdminsModalOpen.value = true
}
</script>
