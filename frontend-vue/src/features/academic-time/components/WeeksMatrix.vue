<template>
  <!-- Matriz de Tiempo Académico - Diseño Premium de Alta Densidad -->
  <div class="w-full space-y-6">
    <div
      v-for="cycle in store.cycles"
      :key="cycle.id"
      class="bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden transition-all duration-200"
      :class="expandedCycles.has(cycle.id) ? 'ring-1 ring-indigo-500/20 border-indigo-500/30' : 'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'"
    >
      <!-- Cabecera de la Tarjeta del Ciclo -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between p-5 gap-4 bg-slate-50/50 dark:bg-[#1e1e2d]/30 border-b border-slate-100 dark:border-slate-700/40">
        <!-- Info del Ciclo -->
        <div class="flex items-center gap-4">
          <!-- Decoración: Icono de Calendario Premium -->
          <div class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/50 flex items-center justify-center text-indigo-500 shadow-sm shrink-0">
            <UIcon name="i-heroicons-calendar-days" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">{{ cycle.name }}</h3>
              <span class="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border border-indigo-100/30 dark:border-indigo-500/20">
                {{ getCycleDaysText(cycle.daysPerWeek) }}
              </span>
              <!-- Estado Estático -->
              <span
                class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold border"
                :class="cycle.isActive 
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                  : 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700/60'"
              >
                <span class="w-1.2 h-1.2 rounded-full" :class="cycle.isActive ? 'bg-emerald-500' : 'bg-slate-400'"></span>
                {{ cycle.isActive ? 'Activo' : 'Archivado' }}
              </span>

              <!-- Interruptor de Estado (Switch) -->
              <button
                type="button"
                class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
                :class="cycle.isActive ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'"
                @click="onToggleCycleVisibility(cycle)"
                title="Cambiar estado del ciclo"
              >
                <span
                  class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out"
                  :class="cycle.isActive ? 'translate-x-4' : 'translate-x-0'"
                />
              </button>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
              <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
              <span>{{ cycle.startDate }}</span>
              <UIcon name="i-heroicons-arrow-right" class="w-2.5 h-2.5 text-slate-400" />
              <span>{{ cycle.endDate }}</span>
            </p>
          </div>
        </div>

        <!-- Acciones del Ciclo -->
        <div class="flex flex-wrap items-center justify-between sm:justify-start gap-4">
          <!-- Indicador de Semanas Activas -->
          <div class="flex items-center gap-3">
            <div class="text-right">
              <p class="text-xs font-bold text-slate-700 dark:text-slate-300">
                {{ activeWeekCount(cycle) }} de {{ cycle.weeks.length }} semanas
              </p>
              <p class="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                Operativas
              </p>
            </div>
            <div class="w-24 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden shadow-inner">
              <div
                class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
                :style="{ width: `${(activeWeekCount(cycle) / cycle.weeks.length) * 100}%` }"
              />
            </div>
          </div>

          <!-- Grupo de Botones de Acción -->
          <div class="flex items-center gap-2 border-l border-slate-200 dark:border-slate-700/50 pl-4">
            <!-- Alternar semanas -->
            <UButton
              size="sm"
              color="gray"
              variant="ghost"
              class="btn-premium-secondary"
              :icon="expandedCycles.has(cycle.id) ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'"
              @click="toggleCycleExpand(cycle.id)"
            >
              {{ expandedCycles.has(cycle.id) ? 'Ocultar Semanas' : 'Ver Semanas' }}
            </UButton>

            <!-- Gestionar Materiales -->
            <!-- Gestionar Materiales -->
            <UButton
              size="sm"
              color="gray"
              variant="ghost"
              class="btn-premium-secondary flex items-center"
              icon="i-heroicons-document-duplicate"
              :to="`/academic-time/cycles/${cycle.id}/materials`"
            >
              <span>Plantillas</span>
              
              <!-- Si hay 0 plantillas: Mostrar icono de advertencia con tooltip nativo -->
              <UIcon 
                v-if="cycle.templateCount === 0" 
                name="i-heroicons-exclamation-triangle" 
                class="w-4.5 h-4.5 text-amber-500 ml-1.5 shrink-0" 
                title="Se requiere configurar plantillas para este ciclo"
              />

              <!-- Si hay plantillas: Mostrar contador tradicional -->
              <span
                v-else-if="cycle.templateCount !== undefined"
                class="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/30 dark:border-indigo-500/20"
                title="Cantidad de plantillas configuradas"
              >
                {{ cycle.templateCount }}
              </span>
            </UButton>

            <!-- Acciones secundarias agrupadas -->
            <div class="flex items-center bg-slate-100/80 dark:bg-[#36364e]/50 rounded-xl border border-slate-200/40 dark:border-slate-700/40 p-0.5">
              <UButton 
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-pencil-square"
                class="btn-premium-icon-neutral"
                @click="onEditCycle(cycle)"
                title="Editar Ciclo"
              />
              <UButton 
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-heroicons-trash"
                class="btn-premium-icon-danger"
                @click="onDeleteCycle(cycle.id)"
                title="Eliminar Ciclo"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Cuadrícula de Semanas (Expandido) -->
      <transition name="expand">
        <div v-if="expandedCycles.has(cycle.id)" class="p-6 bg-slate-50/20 dark:bg-[#1e1e2d]/10 border-t border-slate-100 dark:border-slate-800">
          <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <button
              v-for="week in cycle.weeks"
              :key="week.id"
              class="relative flex flex-col rounded-2xl border text-left cursor-pointer select-none overflow-hidden transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:ring-offset-1 dark:focus:ring-offset-[#2b2b3f] group shadow-sm hover:shadow-md"
              :class="weekCellClass(week)"
              :title="week.isActive ? `Semana ${week.weekNumber} — click para pausar` : `Semana ${week.weekNumber} — click para reactivar`"
              @click="onToggleWeek(week)"
            >
              <!-- Spinner de Carga Individual -->
              <div v-if="pendingWeeks.has(week.id)" class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-[#2b2b3f]/70 z-10 backdrop-blur-[1px]">
                <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin text-indigo-500" />
              </div>

              <!-- Cabecera de Celda Calendario -->
              <div 
                class="px-3 py-2 flex items-center justify-between border-b transition-colors"
                :class="week.isActive 
                  ? 'bg-indigo-50/70 border-indigo-100/50 dark:bg-indigo-500/10 dark:border-indigo-500/20' 
                  : 'bg-slate-50 border-slate-200/50 dark:bg-[#252536] dark:border-slate-700/60'"
              >
                <div class="flex items-center gap-1.5">
                  <UIcon name="i-heroicons-calendar" class="w-3.5 h-3.5 shrink-0" :class="week.isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'" />
                  <span class="text-[10px] font-extrabold uppercase tracking-wider" :class="week.isActive ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-500 dark:text-slate-400'">
                    Semana {{ week.weekNumber }}
                  </span>
                </div>
                <UIcon 
                  :name="week.isActive ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-minus-circle-20-solid'" 
                  class="w-4 h-4 shrink-0"
                  :class="week.isActive ? 'text-indigo-500 dark:text-indigo-400' : 'text-slate-300 dark:text-slate-600'"
                />
              </div>

              <!-- Cuerpo de Celda Calendario -->
              <div class="p-3.5 flex-1 flex flex-col justify-center items-center relative overflow-hidden bg-white dark:bg-[#2b2b3f] transition-all" :class="!week.isActive && 'opacity-65'">
                <div class="text-[13px] font-bold tracking-tight" :class="week.isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 line-through'">
                  {{ formatDayWithShortName(week.startDate) }} - {{ formatDayWithShortName(week.endDate) }}
                </div>
                <div class="text-[9px] font-extrabold tracking-wider text-slate-400 dark:text-slate-500 uppercase mt-1">
                  {{ formatMonthRange(week.startDate, week.endDate) }}
                </div>

                <!-- Overlay de Acción Hover -->
                <div class="absolute inset-0 bg-white/95 dark:bg-[#2b2b3f]/95 opacity-0 group-hover:opacity-100 transition-opacity duration-150 flex flex-col items-center justify-center">
                  <span
                    class="text-[11px] font-bold flex items-center gap-1 scale-95 group-hover:scale-100 transition-transform duration-150"
                    :class="week.isActive ? 'text-rose-500' : 'text-emerald-500'"
                  >
                    <UIcon :name="week.isActive ? 'i-heroicons-pause-circle' : 'i-heroicons-play-circle'" class="w-4 h-4" />
                    {{ week.isActive ? 'Pausar Semana' : 'Activar Semana' }}
                  </span>
                </div>
              </div>
            </button>
          </div>
        </div>
      </transition>
    </div>

    <!-- Gatillo de Infinite Scroll -->
    <div v-if="store.cycles.length > 0" ref="loadMoreTrigger" class="h-10 flex items-center justify-center pt-2">
      <span v-if="store.isLoading && store.cycles.length > 0" class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 font-medium animate-pulse">
        <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin text-indigo-500" />
        Cargando más ciclos...
      </span>
    </div>

    <!-- Estado Vacío -->
    <div v-if="store.cycles.length === 0 && !store.isLoading" class="py-16 text-center bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
      <UIcon name="i-heroicons-inbox" class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
      <p class="text-sm text-slate-500 dark:text-slate-400">No se encontraron ciclos configurados.</p>
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
              ¿Eliminar ciclo académico?
            </h3>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
              Esta acción eliminará el ciclo <strong class="text-slate-800 dark:text-slate-200">"{{ cycleToDeleteName }}"</strong> y todas sus semanas. Los sílabos asociados se archivarán automáticamente.
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
                :loading="isDeleting"
                @click="confirmDeleteCycle"
              >
                Confirmar Eliminación
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAcademicTimeStore } from '../store'
import type { Cycle, CycleWeek } from '../store/index'
import { useIntersectionObserver } from '@vueuse/core'

const store = useAcademicTimeStore()
const toast = useToast()

const emit = defineEmits<{
  'edit': [cycle: Cycle]
}>()

const pendingWeeks = ref(new Set<string>())
const expandedCycles = ref(new Set<string>())
const loadMoreTrigger = ref<HTMLElement | null>(null)

const isDeleteConfirmOpen = ref(false)
const isDeleting = ref(false)
const cycleToDeleteId = ref<string>('')
const cycleToDeleteName = ref('')

const targetIsVisible = ref(false)

// Gatillo para Infinite Scroll
useIntersectionObserver(
  loadMoreTrigger,
  ([{ isIntersecting }]) => {
    targetIsVisible.value = isIntersecting
    if (isIntersecting && store.hasMore && !store.isLoading && !store.error) {
      store.fetchCycles(true)
    }
  },
  { threshold: 0.1 }
)

// Monitoreo de finalización de carga para pantallas grandes
watch(() => store.isLoading, (loading) => {
  if (!loading && targetIsVisible.value && store.hasMore && !store.error) {
    store.fetchCycles(true)
  }
})

function toggleCycleExpand(id: string) {
  if (expandedCycles.value.has(id)) expandedCycles.value.delete(id)
  else expandedCycles.value.add(id)
}

function activeWeekCount(cycle: Cycle) {
  return cycle.weeks.filter(w => w.isActive).length
}

function getCycleDaysText(days: number) {
  if (days === 1) return 'Solo Lunes'
  if (days === 2) return 'Lunes a Martes'
  if (days === 3) return 'Lunes a Miércoles'
  if (days === 4) return 'Lunes a Jueves'
  if (days === 5) return 'Lunes a Viernes'
  if (days === 6) return 'Lunes a Sábado'
  if (days === 7) return 'Lunes a Domingo'
  return `${days} días por semana`
}

function formatDayWithShortName(dateStr: string) {
  if (!dateStr) return '?'
  const date = new Date(dateStr + 'T00:00:00Z')
  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const dayName = days[date.getUTCDay()]
  const [, , day] = dateStr.split('-')
  return `${dayName} ${day}`
}

function formatMonthRange(start: string, end: string) {
  if (!start) return ''
  const [, sMonth] = start.split('-')
  
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const sMonthName = months[parseInt(sMonth, 10) - 1]
  
  if (!end) return sMonthName
  
  const [, eMonth] = end.split('-')
  const eMonthName = months[parseInt(eMonth, 10) - 1]
  
  if (sMonth === eMonth) {
    return sMonthName
  } else {
    return `${sMonthName} - ${eMonthName}`
  }
}

function weekCellClass(week: CycleWeek) {
  if (pendingWeeks.value.has(week.id)) {
    return 'border-slate-200 dark:border-slate-700/50 pointer-events-none opacity-50'
  }
  if (week.isActive) {
    return 'border-indigo-100 dark:border-indigo-500/20 hover:border-indigo-400 dark:hover:border-indigo-400 shadow-sm'
  }
  // Diseño de patrón diagonal sutil para semanas no operativas
  return 'border-dashed border-slate-200 dark:border-slate-700/60 bg-[linear-gradient(45deg,rgba(148,163,184,0.03)_25%,transparent_25%,transparent_50%,rgba(148,163,184,0.03)_50%,rgba(148,163,184,0.03)_75%,transparent_75%,transparent)] bg-[length:16px_16px] bg-slate-50/50 dark:bg-[#1e1e2d]/10'
}

async function onToggleWeek(week: CycleWeek) {
  pendingWeeks.value.add(week.id)
  try {
    await store.toggleWeekVisibility(week.id, !week.isActive)
  } catch (e: any) {
    toast.add({ title: e.message, color: 'red', timeout: 3000 })
  } finally {
    pendingWeeks.value.delete(week.id)
  }
}

async function onToggleCycleVisibility(cycle: Cycle) {
  try {
    await store.toggleCycleVisibility(cycle.id, !cycle.isActive)
  } catch (e: any) {
    toast.add({ title: e.message, color: 'red', timeout: 3000 })
  }
}

function onDeleteCycle(cycleId: string) {
  const cycle = store.cycles.find(c => c.id === cycleId)
  if (!cycle) return
  cycleToDeleteId.value = cycleId
  cycleToDeleteName.value = cycle.name
  isDeleteConfirmOpen.value = true
}

async function confirmDeleteCycle() {
  isDeleting.value = true
  try {
    await store.deleteCycle(cycleToDeleteId.value)
    toast.add({ title: 'Ciclo eliminado con éxito', color: 'success', timeout: 2000 })
    isDeleteConfirmOpen.value = false
  } catch (e: any) {
    toast.add({ title: e.message, color: 'red', timeout: 3000 })
  } finally {
    isDeleting.value = false
  }
}

function onEditCycle(cycle: Cycle) {
  emit('edit', cycle)
}

// Lógica global para interactuar desde el componente padre
const isAllCyclesExpanded = computed(() => {
  if (store.cycles.length === 0) return false
  return store.cycles.every(c => expandedCycles.value.has(c.id))
})

function toggleAllCycles() {
  if (isAllCyclesExpanded.value) {
    expandedCycles.value.clear()
  } else {
    store.cycles.forEach(c => expandedCycles.value.add(c.id))
  }
}

defineExpose({
  isAllCyclesExpanded,
  toggleAllCycles
})
</script>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 1200px;
  opacity: 1;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-top: 0 !important;
  border-top-width: 0 !important;
}
</style>
