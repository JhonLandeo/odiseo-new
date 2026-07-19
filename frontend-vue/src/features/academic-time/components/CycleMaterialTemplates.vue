<template>
  <div class="flex flex-col bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm overflow-hidden min-h-[360px] ring-1 ring-black/[0.02]">

    <div v-if="store.isLoadingTemplates" class="flex items-center justify-center flex-1 py-20">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-slate-300" />
    </div>

    <div v-else-if="!templates || templates.length === 0" class="flex flex-col items-center justify-center flex-1 py-16 px-6 text-center">
      <div class="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-4">
        <UIcon name="i-heroicons-document-duplicate" class="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">No hay plantillas configuradas</h3>
      <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
        Empieza creando una plantilla base para definir cuántas preguntas de cada curso irán en los exámenes.
      </p>
      <NuxtLink
        :to="`/academic-time/cycles/${cycleId}/materials/new`"
        class="mt-6 px-4 py-2 text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 rounded-md transition-colors"
      >
        Crear mi primera plantilla
      </NuxtLink>
    </div>

    <div v-else class="flex-1 overflow-y-auto p-6 lg:p-8">
      <div class="flex justify-end mb-6">
        <NuxtLink
          :to="`/academic-time/cycles/${cycleId}/materials/new`"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20"
        >
          <span class="text-lg leading-none mb-0.5">+</span>
          Nueva Plantilla
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          v-for="template in templates"
          :key="template.id"
          class="group relative flex flex-col p-5 bg-white dark:bg-[#252536] border border-slate-200 dark:border-slate-700/60 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all duration-200"
        >
          <div class="flex items-start justify-between mb-3">
            <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              <NuxtLink :to="`/academic-time/cycles/${cycleId}/materials/${template.id}`" class="focus:outline-none">
                <span class="absolute inset-0" aria-hidden="true"></span>
                {{ template.name }}
              </NuxtLink>
            </h4>
            <button
              @click.prevent.stop="handleDelete(template.id)"
              class="relative z-10 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
              title="Eliminar"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4" />
            </button>
          </div>

          <div class="mt-auto space-y-2.5">
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <UIcon name="i-heroicons-clock" class="w-4 h-4 text-slate-400" />
              <span>{{
                template.scope === 'CURRENT_WEEK'
                  ? 'Semana actual'
                  : template.scope === 'FULL_ACCUMULATIVE'
                  ? 'Acumulativo (todo el ciclo)'
                  : `Acumulativo (${template.accumulationWeeks} sem)`
              }}</span>
            </div>
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <UIcon name="i-heroicons-book-open" class="w-4 h-4 text-slate-400" />
              <span><strong class="text-slate-700 dark:text-slate-300">{{ template.courses.length }}</strong> cursos participan</span>
            </div>
            
            <div class="pt-4 mt-2 border-t border-slate-100 dark:border-slate-700/50">
              <button
                @click.prevent.stop="openGenerateModal(template.id)"
                class="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 dark:text-indigo-400 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 rounded-lg transition-colors"
              >
                <UIcon name="i-heroicons-bolt" class="w-4 h-4" />
                Generar Material
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de Confirmación de Eliminación -->
    <UModal v-model:open="isDeleteConfirmOpen">
      <template #content>
        <UCard>
          <div class="p-4 flex flex-col items-center text-center">
            <div class="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 ring-8 ring-red-50/50 dark:ring-red-900/10">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6" />
            </div>
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
              ¿Eliminar plantilla?
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
              Los exámenes generados con esta plantilla no se borrarán, pero no podrás usarla para nuevas generaciones.
            </p>
            <div class="flex items-center gap-3 w-full mt-6">
              <UButton
                variant="outline"
                color="neutral"
                class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
                @click="isDeleteConfirmOpen = false"
              >
                Cancelar
              </UButton>
              <UButton
                color="error"
                class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
                :loading="isDeletingTemplate"
                @click="confirmDeleteTemplate"
              >
                Confirmar Eliminación
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Generate Modal -->
    <MaterialGenerateModal
      ref="generateModalRef"
      :cycleId="cycleId"
      :defaultTemplateId="activeTemplateId"
      @success="handleGenerateSuccess"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useToast } from '#imports'
import { useAcademicTimeStore } from '@/features/academic-time/store'
import MaterialGenerateModal from '@/features/materials/components/MaterialGenerateModal.vue'

const props = defineProps<{ cycleId: string }>()

const store = useAcademicTimeStore()
const toast = useToast()
const generateModalRef = ref<any>(null)
const activeTemplateId = ref<string>('')

const templates = computed(() => store.templatesByCycle[props.cycleId] ?? [])
const isDeleteConfirmOpen = ref(false)
const isDeletingTemplate = ref(false)
const templateToDeleteId = ref<string>('')

onMounted(async () => {
  await store.fetchTemplates(props.cycleId)
})

function handleDelete(templateId: string) {
  templateToDeleteId.value = templateId
  isDeleteConfirmOpen.value = true
}

async function confirmDeleteTemplate() {
  isDeletingTemplate.value = true
  try {
    await store.deleteTemplate(props.cycleId, templateToDeleteId.value)
    toast.add({ title: 'Plantilla eliminada', color: 'success', duration: 2000 })
    isDeleteConfirmOpen.value = false
  } catch (e) {
    console.error(e)
    toast.add({ title: 'Error al eliminar', description: 'Ocurrió un problema, inténtalo de nuevo.', color: 'red' })
  } finally {
    isDeletingTemplate.value = false
  }
}

function openGenerateModal(templateId: string) {
  activeTemplateId.value = templateId
  if (generateModalRef.value) {
    generateModalRef.value.isOpen = true
  }
}

function handleGenerateSuccess() {
  toast.add({
    title: 'Generación iniciada',
    description: 'Revisa el Workspace de Materiales para seguir el progreso.',
    color: 'success',
    duration: 3000
  })
}
</script>
