<template>
  <div class="px-8 py-6 max-w-full space-y-6">
    <!-- 1. Encabezado de la Página -->
    <div
      class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-700/30">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Ciclos Académicos</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Gestiona los ciclos académicos y su calendario de semanas. Pausa feriados o vacaciones sin eliminar datos.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UButton id="tour-create-cycle" color="neutral" variant="ghost" icon="i-heroicons-plus" size="md" class="btn-premium-primary"
          @click="openCreateSlide">
          Nuevo Ciclo
        </UButton>
      </div>
    </div>



    <!-- 3. Barra de Búsqueda y Control Premium (Sticky Floating Card) -->
    <div
      class="sticky top-[8.5rem] z-20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl shadow-md transition-all">
      <!-- Buscador -->
      <div class="flex-1 max-w-md relative">
        <UInput v-model="searchQuery" placeholder="Buscar ciclo..." icon="i-heroicons-magnifying-glass" size="md"
          color="neutral" variant="outline" class="w-full" id="cycle-search-input"
          :ui="{ icon: { trailing: { pointer: '' } } }">
          <template #trailing>
            <div
              class="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-mono select-none">
              /
            </div>
          </template>
        </UInput>
      </div>

      <!-- Acciones de Matriz -->
      <div class="flex items-center gap-3">
        <UButton size="sm" color="neutral" variant="ghost" class="btn-premium-secondary"
          icon="i-heroicons-arrows-pointing-out" @click="toggleAllCycles">
          {{ isAllCyclesExpanded ? 'Colapsar Semanas' : 'Expandir Semanas' }}
        </UButton>
      </div>
    </div>

    <!-- 4. Cargando (Skeletons de Bloques de Ciclo) -->
    <div v-if="(!store.hasFetched || store.isLoading) && store.cycles.length === 0" class="space-y-6">
      <div v-for="i in 2" :key="i"
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4 shadow-sm animate-pulse">
        <div class="flex justify-between items-center">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-slate-100 dark:bg-[#1e1e2d] shrink-0" />
            <div class="space-y-1.5">
               <div class="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded-md" />
               <div class="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded-md" />
            </div>
          </div>
          <div class="w-7 h-7 bg-slate-200 dark:bg-slate-700 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>

    <!-- Empty state simple for when no cycles exist -->
    <div v-if="store.hasFetched && !store.isLoading && store.cycles.length === 0" class="flex flex-col items-center justify-center py-20 text-center">
      <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
        <UIcon name="i-heroicons-calendar-days" class="w-8 h-8" />
      </div>
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-2">No hay ciclos creados</h3>
      <p class="text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
        Crea tu primer ciclo académico para empezar a gestionar tus semanas, temarios y material.
      </p>
      <UButton color="primary" @click="openCreateSlide">Crear Primer Ciclo</UButton>
    </div>

    <!-- 5. Matriz de semanas -->
    <WeeksMatrix ref="weeksMatrixRef" v-show="store.cycles.length > 0" @edit="openEditSlide" />

    <!-- Slide-over para Crear/Editar Ciclos -->
    <CycleSlideOver v-model="showCreateSlide" :cycleToEdit="selectedCycle" @submit="onSubmitted" />

    <!-- Leyenda / Indicador de Teclado -->
    <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 pt-2 select-none">
      <kbd
        class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">⌘
        K</kbd>
      <span>o</span>
      <kbd
        class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">/</kbd>
      <span>para enfocar el buscador de ciclos</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAcademicTimeStore } from '../../features/academic-time/store'
import type { Cycle } from '../../features/academic-time/store'
import WeeksMatrix from '../../features/academic-time/components/WeeksMatrix.vue'
import CycleSlideOver from '../../features/academic-time/components/CycleSlideOver.vue'
import { useToast } from '#imports'
import { watchDebounced } from '@vueuse/core'
import { PERMISSIONS } from '@/core/auth/permissions'

definePageMeta({
  layout: 'b2b',
  permissions: [PERMISSIONS.VIEW_ACADEMIC_TIME],
})

const store = useAcademicTimeStore()
const showCreateSlide = ref(false)
const selectedCycle = ref<Cycle | null>(null)
const searchQuery = ref('')
const toast = useToast()
const weeksMatrixRef = ref<any>(null)


// Expansión global coordinada
const isAllCyclesExpanded = computed(() => weeksMatrixRef.value?.isAllCyclesExpanded ?? false)

function toggleAllCycles() {
  weeksMatrixRef.value?.toggleAllCycles()
}

// Búsqueda remota con debounce
watchDebounced(
  searchQuery,
  (newVal) => {
    store.fetchCycles(false, newVal)
  },
  { debounce: 400, maxWait: 1000 }
)

// Atajo de teclado global para enfocar el buscador
function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/')) {
    const activeEl = document.activeElement
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return
    }
    e.preventDefault()
    const input = document.getElementById('cycle-search-input')
    if (input) (input as HTMLInputElement).focus()
  }
}

onMounted(() => {
  store.fetchCycles()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

function openCreateSlide() {
  selectedCycle.value = null
  showCreateSlide.value = true
}

function openEditSlide(cycle: Cycle) {
  selectedCycle.value = cycle
  showCreateSlide.value = true
}

function onSubmitted() {
  toast.add({
    title: selectedCycle.value ? 'Ciclo actualizado con éxito' : 'Ciclo creado con éxito',
    color: 'success',
    duration: 2500
  })
  showCreateSlide.value = false
}
</script>
