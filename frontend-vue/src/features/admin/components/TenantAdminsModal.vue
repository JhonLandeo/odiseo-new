<template>
  <div v-if="isOpen" class="relative z-50" aria-labelledby="modal-title" role="dialog" aria-modal="true">
    <div class="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" @click="close"></div>
    <div class="fixed inset-0 z-10 overflow-y-auto">
      <div class="flex min-h-full items-end justify-center p-4 text-center sm:items-center sm:p-0">
        <div class="relative transform overflow-hidden rounded-3xl bg-white dark:bg-[#2b2b3f] text-left shadow-2xl transition-all sm:my-8 sm:w-full sm:max-w-4xl border border-slate-200 dark:border-slate-700/50 flex flex-col h-[85vh]">
          
          <!-- Header -->
          <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-700/50 flex justify-between items-center shrink-0">
            <div>
              <h3 class="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2" id="modal-title">
                <UIcon name="i-heroicons-users" class="w-6 h-6 text-indigo-500" />
                Administradores de la Empresa
              </h3>
              <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Gestiona los accesos (Directores B2B) para esta empresa.</p>
            </div>
            <button @click="close" class="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300 transition-colors">
              <UIcon name="i-heroicons-x-mark" class="w-6 h-6" />
            </button>
          </div>

          <div class="flex-1 overflow-hidden flex flex-col sm:flex-row">
            <!-- Form Area (Left) -->
            <div class="w-full sm:w-1/3 border-b sm:border-b-0 sm:border-r border-slate-200 dark:border-slate-700/50 p-6 bg-slate-50/50 dark:bg-slate-800/20 overflow-y-auto">
              <h4 class="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <UIcon :name="isEditing ? 'i-heroicons-pencil' : 'i-heroicons-plus-circle'" class="w-5 h-5 text-indigo-500" />
                {{ isEditing ? 'Editar Administrador' : 'Nuevo Administrador' }}
              </h4>
              
              <form @submit.prevent="handleSubmit" class="space-y-4">
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Nombre Completo</label>
                  <input type="text" v-model="form.name" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div>
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Correo Electrónico</label>
                  <input type="email" v-model="form.email" required :disabled="isEditing" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed" />
                </div>
                <div v-if="!isEditing">
                  <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">Contraseña</label>
                  <input type="text" v-model="form.password" required class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" />
                </div>
                <div v-if="isEditing" class="flex items-center gap-2">
                  <input type="checkbox" v-model="form.isActive" id="isActive" class="rounded text-indigo-600 focus:ring-indigo-500" />
                  <label for="isActive" class="text-sm font-medium text-slate-700 dark:text-slate-300">Cuenta Activa</label>
                </div>
                
                <div class="pt-4 flex gap-2">
                  <button type="submit" :disabled="loading" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                    <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                    {{ isEditing ? 'Guardar Cambios' : 'Crear Admin' }}
                  </button>
                  <button v-if="isEditing" type="button" @click="resetForm" class="px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors">
                    Cancelar
                  </button>
                </div>
              </form>

              <hr v-if="isEditing" class="my-6 border-slate-200 dark:border-slate-700/50" />

              <div v-if="isEditing">
                <h4 class="font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                  <UIcon name="i-heroicons-key" class="w-5 h-5 text-amber-500" />
                  Cambiar Contraseña
                </h4>
                <form @submit.prevent="handlePasswordChange" class="space-y-4">
                  <div>
                    <input type="text" v-model="passwordForm.password" required placeholder="Nueva contraseña" class="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all" />
                  </div>
                  <button type="submit" :disabled="loading" class="w-full bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
                    <UIcon v-if="loading" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
                    Actualizar Contraseña
                  </button>
                </form>
              </div>
            </div>

            <!-- List Area (Right) -->
            <div class="w-full sm:w-2/3 p-6 overflow-y-auto bg-white dark:bg-[#2b2b3f]">
              <div v-if="admins.length === 0 && !loading" class="text-center py-12">
                <UIcon name="i-heroicons-users" class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p class="text-slate-500 dark:text-slate-400">No hay administradores registrados para esta empresa.</p>
              </div>
              
              <div v-else class="space-y-3">
                <div v-for="admin in admins" :key="admin.id" class="p-4 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors flex items-center justify-between group">
                  <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold shrink-0">
                      {{ admin.name.substring(0, 2).toUpperCase() }}
                    </div>
                    <div>
                      <div class="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        {{ admin.name }}
                        <span v-if="admin.is_active" class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider">Activo</span>
                        <span v-else class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider">Inactivo</span>
                      </div>
                      <div class="text-sm text-slate-500 dark:text-slate-400">{{ admin.email }}</div>
                      <div class="text-[11px] text-slate-400 mt-1">
                        Último acceso: {{ admin.last_login ? new Date(admin.last_login).toLocaleString() : 'Nunca' }}
                      </div>
                    </div>
                  </div>
                  
                  <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button @click="editAdmin(admin)" class="p-2 text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30 rounded-lg transition-colors">
                      <UIcon name="i-heroicons-pencil" class="w-5 h-5" />
                    </button>
                    <button @click="confirmDelete(admin.id)" class="p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30 rounded-lg transition-colors">
                      <UIcon name="i-heroicons-trash" class="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useTenantAdminsStore, type TenantAdmin } from '@/features/admin/store/tenant-admins'
import { useToast } from '#imports'

const props = defineProps<{
  isOpen: boolean
  tenantId: string | null
}>()

const emit = defineEmits(['update:isOpen'])

const adminsStore = useTenantAdminsStore()
const { admins, loading } = storeToRefs(adminsStore)
const toast = useToast()

const isEditing = ref(false)
const editingId = ref('')

const form = ref({
  name: '',
  email: '',
  password: '',
  isActive: true
})

const passwordForm = ref({
  password: ''
})

watch(() => props.isOpen, async (newVal) => {
  if (newVal && props.tenantId) {
    resetForm()
    await adminsStore.fetchAdmins(props.tenantId)
  }
})

const close = () => {
  emit('update:isOpen', false)
  resetForm()
}

const resetForm = () => {
  isEditing.value = false
  editingId.value = ''
  form.value = { name: '', email: '', password: '', isActive: true }
  passwordForm.value = { password: '' }
}

const editAdmin = (admin: TenantAdmin) => {
  isEditing.value = true
  editingId.value = admin.id
  form.value = {
    name: admin.name,
    email: admin.email,
    password: '',
    isActive: admin.is_active
  }
  passwordForm.value.password = ''
}

const handleSubmit = async () => {
  if (!props.tenantId) return
  
  try {
    if (isEditing.value) {
      await adminsStore.updateAdmin(props.tenantId, editingId.value, {
        name: form.value.name,
        is_active: form.value.isActive
      })
      toast.add({ title: 'Actualizado', description: 'Administrador actualizado con éxito.', color: 'success' })
    } else {
      await adminsStore.createAdmin(props.tenantId, {
        name: form.value.name,
        email: form.value.email,
        password: form.value.password
      })
      toast.add({ title: 'Creado', description: 'Administrador creado con éxito.', color: 'success' })
    }
    resetForm()
  } catch (e: any) {
    toast.add({ title: 'Error', description: adminsStore.error || 'Ocurrió un error', color: 'error' })
  }
}

const handlePasswordChange = async () => {
  if (!props.tenantId || !editingId.value) return
  
  try {
    await adminsStore.changePassword(props.tenantId, editingId.value, {
      password: passwordForm.value.password
    })
    toast.add({ title: 'Contraseña Actualizada', description: 'La contraseña fue cambiada.', color: 'success' })
    passwordForm.value.password = ''
  } catch (e: any) {
    toast.add({ title: 'Error', description: adminsStore.error || 'Ocurrió un error', color: 'error' })
  }
}

const confirmDelete = async (id: string) => {
  if (!props.tenantId) return
  if (!confirm('¿Estás seguro de que deseas eliminar a este administrador? Esta acción no se puede deshacer.')) return
  
  try {
    await adminsStore.deleteAdmin(props.tenantId, id)
    toast.add({ title: 'Eliminado', description: 'Administrador eliminado.', color: 'success' })
    if (editingId.value === id) resetForm()
  } catch (e: any) {
    toast.add({ title: 'Error', description: adminsStore.error || 'Ocurrió un error', color: 'error' })
  }
}
</script>
