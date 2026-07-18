<template>
  <div class="px-4 sm:px-6 lg:px-8 py-8 max-w-[90rem] mx-auto h-[calc(100vh-64px)] flex flex-col">
    <!-- Breadcrumbs -->
    <nav class="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 shrink-0" aria-label="Breadcrumb">
      <NuxtLink to="/" class="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Inicio</NuxtLink>
      <svg class="w-4 h-4 mx-2 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      <NuxtLink to="/academic-time" class="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Tiempo Académico</NuxtLink>
      <svg class="w-4 h-4 mx-2 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      <span class="text-slate-900 dark:text-slate-200 truncate max-w-[200px]">{{ cycleName }}</span>
      <svg class="w-4 h-4 mx-2 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      <span class="text-indigo-600 dark:text-indigo-400">Plantillas de Material</span>
    </nav>

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-8 shrink-0">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Plantillas de Material
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">
          Configura las plantillas de evaluación (exámenes, prácticas) que se generarán automáticamente semana a semana para este ciclo.
        </p>
      </div>
      
      <div class="flex items-center gap-3">
        <NuxtLink 
          to="/academic-time" 
          class="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
        >
          Volver
        </NuxtLink>
        <NuxtLink
          :to="`/academic-time/cycles/${cycleId}/materials/new`"
          class="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-600/20"
        >
          <span class="text-lg leading-none mb-0.5">+</span>
          Nueva Plantilla
        </NuxtLink>
      </div>
    </div>
    
    <!-- Main Content Area: List -->
    <div class="flex-1 bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0 ring-1 ring-black/[0.02]">
      <div v-if="store.isLoadingTemplates" class="flex items-center justify-center h-full">
        <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-slate-300" />
      </div>
      
      <div v-else-if="!templates || templates.length === 0" class="flex flex-col items-center justify-center h-full py-16 px-6">
        <div class="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center mb-4">
          <UIcon name="i-heroicons-document-duplicate" class="w-8 h-8 text-slate-300 dark:text-slate-600" />
        </div>
        <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">No hay plantillas configuradas</h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm text-center">Empieza creando una plantilla base para definir cuántas preguntas de cada curso irán en los exámenes.</p>
        <NuxtLink
          :to="`/academic-time/cycles/${cycleId}/materials/new`"
          class="mt-6 px-4 py-2 text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 rounded-md transition-colors"
        >
          Crear mi primera plantilla
        </NuxtLink>
      </div>

      <div v-else class="flex-1 overflow-y-auto p-6 lg:p-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div v-for="template in templates" :key="template.id" 
               class="group relative flex flex-col p-5 bg-white dark:bg-[#252536] border border-slate-200 dark:border-slate-700/60 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all duration-200">
            <div class="flex items-start justify-between mb-3">
              <h4 class="text-base font-bold text-slate-900 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                <NuxtLink :to="`/academic-time/cycles/${cycleId}/materials/${template.id}`" class="focus:outline-none">
                  <span class="absolute inset-0" aria-hidden="true"></span>
                  {{ template.name }}
                </NuxtLink>
              </h4>
              <button @click.prevent.stop="handleDelete(template.id)" class="relative z-10 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors" title="Eliminar">
                <UIcon name="i-heroicons-trash" class="w-4 h-4" />
              </button>
            </div>
            
            <div class="mt-auto space-y-2.5">
              <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <UIcon name="i-heroicons-clock" class="w-4 h-4 text-slate-400" />
                <span>{{ template.scope === 'CURRENT_WEEK' ? 'Se genera de la Semana Actual' : template.scope === 'FULL_ACCUMULATIVE' ? 'Acumulativo (Todo el ciclo)' : `Acumulativo (${template.accumulationWeeks} sem)` }}</span>
              </div>
              <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <UIcon name="i-heroicons-book-open" class="w-4 h-4 text-slate-400" />
                <span><strong class="text-slate-700 dark:text-slate-300">{{ template.courses.length }}</strong> cursos participan</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAcademicTimeStore } from '@/features/academic-time/store'
import { useToast } from '#imports'
import { PERMISSIONS } from '@/core/auth/permissions'

definePageMeta({
  layout: 'b2b',
  permissions: [PERMISSIONS.VIEW_ACADEMIC_TIME],
})

const route = useRoute()
const store = useAcademicTimeStore()
const toast = useToast()

const cycleId = computed(() => route.params.id as string)
const cycle = computed(() => store.cycles.find(c => c.id === cycleId.value))
const cycleName = computed(() => cycle.value ? cycle.value.name : 'Configuración de Ciclo')

const templates = computed(() => store.templatesByCycle[cycleId.value] || [])

onMounted(async () => {
  if (store.cycles.length === 0) {
    store.fetchCycles()
  }
  await store.fetchTemplates(cycleId.value)
})

async function handleDelete(templateId: string) {
  if (!confirm('¿Seguro que deseas eliminar esta plantilla?')) return
  try {
    await store.deleteTemplate(cycleId.value, templateId)
    toast.add({ title: 'Plantilla eliminada', color: 'success' })
  } catch (e) {
    console.error(e)
    toast.add({ title: 'Error al eliminar', description: 'Inténtalo de nuevo más tarde.', color: 'red' })
  }
}
</script>
