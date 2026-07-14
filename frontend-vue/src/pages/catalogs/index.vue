<template>
  <div class="px-8 py-6 max-w-full space-y-6">
    <!-- Encabezado de la Página -->
    <div class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-700/30">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
          Catálogo de Cursos
        </h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Gestiona la visibilidad y distribución temática de las materias escolares.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2 rounded-xl border border-emerald-100/50 dark:border-emerald-900/40 shadow-sm">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
          <span>Sincronizado con Banco Global</span>
          <span v-if="store.lastSyncedAt" class="text-[10px] text-emerald-500/70 dark:text-emerald-500/60 font-medium ml-1">
            · {{ formatSyncTime(store.lastSyncedAt) }}
          </span>
        </span>
      </div>
    </div>

    <!-- Cargando (Skeletons de Bloques de Cursos) -->
    <div v-if="store.isLoading && store.courses.length === 0" class="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <div v-for="i in 4" :key="i" class="bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4 shadow-sm animate-pulse">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1e1e2d] shrink-0" />
            <div class="space-y-1.5">
              <div class="h-4 w-28 bg-slate-200 dark:bg-slate-700 rounded-md" />
              <div class="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded-md" />
            </div>
          </div>
          <div class="w-20 h-2 bg-slate-200 dark:bg-slate-700 rounded-full" />
        </div>
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="store.error && store.courses.length === 0" class="flex flex-col items-center justify-center p-12 bg-white dark:bg-[#2b2b3f] rounded-2xl border border-rose-200/50 dark:border-rose-900/30 text-center max-w-2xl mx-auto my-8 shadow-sm">
      <div class="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 flex items-center justify-center text-rose-500 dark:text-rose-400 mb-4 animate-bounce">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
      </div>
      <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Error al cargar los cursos</h3>
      <p class="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
        No se pudieron obtener las materias escolares. {{ store.error }}
      </p>
      <UButton
        color="error"
        variant="solid"
        icon="i-heroicons-arrow-path"
        class="shadow-sm hover:scale-[1.02] active:scale-[0.98] transition-all"
        @click="store.fetchCourses()"
      >
        Intentar de nuevo
      </UButton>
    </div>

    <!-- Componente Principal del Catálogo -->
    <CatalogTable 
      ref="catalogTableRef"
      v-show="store.courses.length > 0" 
    />

    <!-- Empty State (Onboarding) -->
    <OnboardingEmptyState
      v-if="store.hasFetched && !store.isLoading && !store.error && store.courses.length === 0"
      title="Configura tu Catálogo de Cursos"
      description="Sincroniza y gestiona las materias de tu plan curricular. Carga los datos de demostración para ver ejemplos cargados."
      icon="i-heroicons-book-open"
      create-label="Curso"
      @create="catalogTableRef?.focusSearch()"
      @demo_loaded="store.fetchCourses()"
    />

    <!-- Leyenda / Indicador de Teclado -->
    <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 pt-2 select-none">
      <kbd class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">⌘ K</kbd>
      <span>o</span>
      <kbd class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">/</kbd>
      <span>para enfocar el buscador y filtrar el catálogo rápidamente</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useCatalogsStore } from '../../features/catalogs/store'
import CatalogTable from '../../features/catalogs/components/CatalogTable.vue'
import OnboardingEmptyState from '../../features/onboarding/components/OnboardingEmptyState.vue'

definePageMeta({
  layout: 'b2b',
  permissions: ['view_catalogs'],
})

const store = useCatalogsStore()
const catalogTableRef = ref<any>(null)

// Atajo de teclado global
function formatSyncTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  return `hace ${hours}h`
}

function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/')) {
    const activeEl = document.activeElement
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return
    }
    e.preventDefault()
    catalogTableRef.value?.focusSearch()
  }
}

onMounted(() => {
  store.fetchCourses()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>
