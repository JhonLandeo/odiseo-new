<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useSyllabusStore } from '../../features/syllabus/store';
import { useAcademicTimeStore } from '../../features/academic-time/store';
import { useCatalogsStore } from '../../features/catalogs/store';
import SyllabusSlideOver from '../../features/syllabus/components/SyllabusSlideOver.vue';
import SyllabusDistributionMatrix from '../../features/syllabus/components/SyllabusDistributionMatrix.vue';
import SyllabusCloneModal from '../../features/syllabus/components/SyllabusCloneModal.vue';
import CycleCloneModal from '../../features/syllabus/components/CycleCloneModal.vue';
import { useToast } from '#imports';
import type { Syllabus, SyllabusWithProgress } from '../../features/syllabus/types';
import { PERMISSIONS } from '@/core/auth/permissions';

definePageMeta({
  layout: 'b2b',
  permissions: [PERMISSIONS.VIEW_SYLLABUS],
});

const store = useSyllabusStore();
const timeStore = useAcademicTimeStore();
const catalogsStore = useCatalogsStore();
const toast = useToast();

const slideOverRef = ref<any>();
const cloneModalRef = ref<any>();
const cycleCloneModalRef = ref<any>();
const selectedCycleId = ref<string>('');
const searchQuery = ref('');
const initialLoadComplete = ref(false);
let isFetchingSyllabi = false;

onMounted(() => {
  Promise.all([
    timeStore.fetchCycles(),
    catalogsStore.fetchCourses(),
  ]).catch(() => { });

  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});

watch(() => timeStore.cycles, (cycles) => {
  if (cycles.length > 0 && !selectedCycleId.value) {
    const active = cycles.find(c => c.isActive) ?? cycles[0];
    selectedCycleId.value = active.id;
  }
}, { immediate: true });

watch(selectedCycleId, (newCycleId) => {
  if (!newCycleId) return;
  if (isFetchingSyllabi) return;
  isFetchingSyllabi = true;
  store.syllabus = null;
  Promise.all([
    store.fetchSyllabiByCycle(newCycleId),
    timeStore.fetchTemplates(newCycleId)
  ]).catch(() => { }).finally(() => {
    isFetchingSyllabi = false;
    initialLoadComplete.value = true;
  });
}, { immediate: true });

// Atajo de teclado global (⌘K o /) para enfocar el buscador
function handleKeyDown(e: KeyboardEvent) {
  if ((e.metaKey && e.key === 'k') || (e.ctrlKey && e.key === 'k') || (e.key === '/')) {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      return;
    }
    e.preventDefault();
    const input = document.getElementById('syllabus-search-input');
    if (input) (input as HTMLInputElement).focus();
  }
}

const cycleItems = computed(() => timeStore.cycles);

const selectedCycleName = computed(() => {
  const found = timeStore.cycles.find(c => c.id === selectedCycleId.value);
  return found?.name ?? '';
});

// Filtrado reactivo de la lista de sílabos
const filteredSyllabusesList = computed(() => {
  let list = store.syllabiList.map(syllabus => {
    const course = catalogsStore.courses.find(c => c.id === syllabus.courseId);
    return {
      ...syllabus,
      courseName: course ? course.name : 'Curso Desconocido'
    };
  });

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter(item => item.courseName.toLowerCase().includes(q));
  }

  return list;
});

// Progreso global: avance real por cada plantilla en cada sílabo activo
const overallProgress = computed(() => {
  const syllabi = store.syllabiList.filter(s => s.isActive) as SyllabusWithProgress[];
  if (!syllabi.length) return 0;
  const templates = timeStore.templatesByCycle[selectedCycleId.value] || [];

  if (templates.length === 0) {
    const totalFilled = syllabi.reduce((sum, s) => sum + (s.filledWeeks?.length || 0), 0);
    const totalWeeks = syllabi.reduce((sum, s) => sum + (s.totalWeeks || 0), 0);
    if (!totalWeeks) return 0;
    return Math.round((totalFilled / totalWeeks) * 100);
  }

  let totalFilled = 0;
  let totalWeeks = 0;
  for (const s of syllabi) {
    for (const t of templates) {
      totalFilled += s.templateProgress?.[t.id]?.length || 0;
      totalWeeks += s.totalWeeks || 0;
    }
  }
  if (!totalWeeks) return 0;
  return Math.round((totalFilled / totalWeeks) * 100);
});

const CIRCLE_R = 15.5;
const CIRCUMFERENCE = 2 * Math.PI * CIRCLE_R;

const ringDashOffset = computed(() => CIRCUMFERENCE - (overallProgress.value / 100) * CIRCUMFERENCE);

const isPageLoading = computed(() => {
  if (timeStore.isLoading || !timeStore.hasFetched || catalogsStore.isLoading || !catalogsStore.hasFetched) {
    return true;
  }
  if (timeStore.cycles.length > 0) {
    return !initialLoadComplete.value || store.loading;
  }
  return false;
});

function openCreate(courseId?: string) {
  if (slideOverRef.value) {
    if (courseId) slideOverRef.value.form.courseId = courseId;
    slideOverRef.value.form.cycleId = selectedCycleId.value;
    slideOverRef.value.isOpen = true;
  }
}

function openCycleCloneModal() {
  if (cycleCloneModalRef.value) {
    cycleCloneModalRef.value.open(selectedCycleId.value);
  }
}

function openCloneModal(courseId: string, syllabus: Syllabus) {
  if (cloneModalRef.value && syllabus) {
    store.syllabus = syllabus;
    cloneModalRef.value.courseId = courseId;
    cloneModalRef.value.isOpen = true;
  }
}

function openSyllabus(syllabus: Syllabus) {
  const templates = timeStore.templatesByCycle[syllabus.cycleId] || [];
  if (templates.length > 0 && !store.activeTemplateId) {
    store.activeTemplateId = templates[0].id;
  }
  store.syllabus = syllabus;
}

function openSyllabusWithTemplate(syllabus: Syllabus, templateId: string) {
  store.activeTemplateId = templateId;
  store.syllabus = syllabus;
}

async function backToList() {
  store.syllabus = null;
  if (selectedCycleId.value) {
    try {
      await store.fetchSyllabiByCycle(selectedCycleId.value);
    } catch (e) {
      console.error('Error refetching syllabi list:', e);
    }
  }
}

async function onToggleSyllabus(syllabusId: string, isActive: boolean) {
  try {
    await store.toggleSyllabusVisibility(syllabusId, isActive);
    toast.add({
      title: isActive ? 'Sílabo reactivado' : 'Sílabo archivado',
      color: 'success',
      timeout: 2000
    });
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.message || 'No se pudo actualizar el estado del sílabo',
      color: 'red',
      timeout: 3000
    });
  }
}

const cycleTemplates = computed(() => {
  return timeStore.templatesByCycle[selectedCycleId.value] || [];
});

function getTemplateFilledWeeks(item: SyllabusWithProgress, templateId: string): number {
  return item.templateProgress?.[templateId]?.length || 0;
}

function getTemplateProgressPercent(item: SyllabusWithProgress, templateId: string): number {
  if (!item.totalWeeks) return 0;
  const filled = getTemplateFilledWeeks(item, templateId);
  return Math.round((filled / item.totalWeeks) * 100);
}

function hasGaps(item: SyllabusWithProgress) {
  const templates = timeStore.templatesByCycle[selectedCycleId.value] || [];
  if (templates.length === 0) {
    if (!item.filledWeeks || item.filledWeeks.length === 0) return false;
    const maxFilled = Math.max(...item.filledWeeks);
    for (let w = 1; w < maxFilled; w++) {
      if (!item.filledWeeks.includes(w)) return true;
    }
    return false;
  }

  for (const t of templates) {
    const weeks = item.templateProgress?.[t.id] || [];
    if (weeks.length === 0) continue;
    const maxFilled = Math.max(...weeks);
    for (let w = 1; w < maxFilled; w++) {
      if (!weeks.includes(w)) return true;
    }
  }
  return false;
}

function getProgressPercent(item: SyllabusWithProgress) {
  if (!item.totalWeeks) return 0;
  return Math.round(((item.filledWeeks?.length || 0) / item.totalWeeks) * 100);
}

function isFullyEmpty(item: SyllabusWithProgress) {
  const templates = timeStore.templatesByCycle[selectedCycleId.value] || [];
  if (templates.length === 0) {
    return !item.filledWeeks || item.filledWeeks.length === 0;
  }
  return templates.every(t => getTemplateFilledWeeks(item, t.id) === 0);
}

function isIncomplete(item: SyllabusWithProgress) {
  const templates = timeStore.templatesByCycle[selectedCycleId.value] || [];
  if (templates.length === 0) {
    return getProgressPercent(item) < 100;
  }
  return templates.some(t => getTemplateProgressPercent(item, t.id) < 100);
}

function getTemplateWeekStyle(item: SyllabusWithProgress, templateId: string, week: number) {
  const weeks = item.templateProgress?.[templateId] || [];
  const isFilled = weeks.includes(week);

  if (isFilled) {
    return {
      classes: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 hover:scale-110',
      title: `Semana ${week}: Planificada`
    };
  }

  // Check if it's a gap (empty week before a planned week)
  const isGap = weeks.some(w => w > week);
  if (isGap) {
    return {
      classes: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-250 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-950/50 hover:scale-110',
      title: `Semana ${week}: Inconsistencia (semana vacía intermedia)`
    };
  }

  return {
    classes: 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/80 hover:scale-110',
    title: `Semana ${week}: Vacía`
  };
}

function getGeneralWeekStyle(item: SyllabusWithProgress, week: number) {
  const isFilled = item.filledWeeks?.includes(week);

  if (isFilled) {
    return {
      classes: 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/20 hover:scale-110',
      title: `Semana ${week}: Planificada`
    };
  }

  // Check if it's a gap
  const isGap = (item.filledWeeks || []).some(w => w > week);
  if (isGap) {
    return {
      classes: 'bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 border border-amber-250 dark:border-amber-800/60 hover:bg-amber-100 dark:hover:bg-amber-950/50 hover:scale-110',
      title: `Semana ${week}: Inconsistencia (semana vacía intermedia)`
    };
  }

  return {
    classes: 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700/80 hover:scale-110',
    title: `Semana ${week}: Vacía`
  };
}
</script>

<template>
  <div class="px-8 py-6 max-w-full space-y-6">

    <!-- 1. Encabezado de la Página -->
    <div v-if="!store.syllabus"
      class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-700/30">
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Gestión de Sílabos</h1>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Configura la distribución semanal de preguntas para tus cursos según el ciclo académico seleccionado.
        </p>
      </div>

      <!-- Selector de ciclo y botón Añadir -->
      <div class="flex items-center gap-3">
        <span class="text-xs font-bold text-slate-500 dark:text-slate-400 select-none">Ciclo Académico:</span>
        <USelectMenu v-model="selectedCycleId" :items="cycleItems" value-key="id" label-key="name"
          placeholder="Seleccionar ciclo..." class="w-56" :search-input="false" />

        <UButton v-if="!store.syllabus" color="gray" variant="ghost" icon="i-heroicons-document-duplicate" size="md"
          class="btn-premium-secondary" @click="openCycleCloneModal()">
          Clonar Ciclo
        </UButton>
        <UButton v-if="!store.syllabus" id="tour-create-syllabus" color="neutral" variant="ghost" icon="i-heroicons-plus" size="md"
          class="btn-premium-primary" @click="openCreate()">
          Crear Sílabo
        </UButton>
      </div>
    </div>

    <!-- ── CASO A: Matriz de Distribución (Edición activa de un Sílabo) ── -->
    <div v-if="store.syllabus" class="space-y-6">
      <div class="flex items-center gap-3">
        <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" class="btn-premium-ghost"
          @click="backToList">
          Volver al listado
        </UButton>
        <span class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
          Ciclo:
          <strong
            class="text-slate-700 dark:text-slate-200 font-bold bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded-lg">{{
              selectedCycleName }}</strong>
        </span>
      </div>
      <SyllabusDistributionMatrix />
    </div>

    <!-- ── CASO B: Listado de Sílabos por Curso ── -->
    <div v-else class="space-y-6">

      <!-- 2. Barra de Búsqueda y Filtro Premium (Sticky Floating Card) -->
      <div
        class="sticky top-[6rem] z-20 bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl shadow-md flex flex-col sm:flex-row items-center gap-4 transition-all">
        <div class="flex-1 w-full max-w-md relative">
          <UInput v-model="searchQuery" placeholder="Buscar por curso..." icon="i-heroicons-magnifying-glass" size="md"
            color="gray" variant="outline" class="w-full" id="syllabus-search-input"
            :ui="{ icon: { trailing: { pointer: '' } } }">
            <template #trailing>
              <div
                class="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-mono select-none">
                /
              </div>
            </template>
          </UInput>
        </div>
        <span class="text-xs text-slate-455 dark:text-slate-500 select-none hidden sm:inline-block font-medium">
          Mostrando {{ filteredSyllabusesList.length }} sílabos
        </span>
      </div>

      <!-- 4. Contenedor del Listado en Tarjetas Premium -->
      <div class="space-y-4">
        <!-- Skeletons de Carga -->
        <div v-if="isPageLoading" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div v-for="i in 3" :key="i"
            class="h-64 bg-white dark:bg-[#1e1e2d] rounded-2xl border border-slate-200 dark:border-slate-800/80 animate-pulse" />
        </div>

        <template v-else>
          <div v-if="filteredSyllabusesList.length > 0" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <!-- Tarjeta de Sílabo -->
            <div v-for="item in filteredSyllabusesList" :key="item.id"
              class="bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 flex flex-col justify-between relative group overflow-hidden">

              <!-- Gradient top highlight on hover -->
              <div
                class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />

              <div class="space-y-4">
                <!-- Header: Icono + Nombre + Estado -->
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div
                      class="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/30 dark:border-indigo-900/30 text-indigo-500 flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-105">
                      <UIcon name="i-heroicons-book-open" class="w-5.5 h-5.5" />
                    </div>
                    <div class="min-w-0">
                      <h3
                        class="text-sm font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate"
                        :title="item.courseName">
                        {{ item.courseName }}
                      </h3>
                      <p class="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Curso del ciclo</p>
                    </div>
                  </div>
                  <div class="shrink-0">
                    <span v-if="item.isActive"
                      class="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-100/50 dark:border-emerald-500/20">
                      Activo
                    </span>
                    <span v-else
                      class="inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700/60">
                      Archivado
                    </span>
                  </div>
                </div>

                <!-- Matriz Unificada por Plantilla y Semanas -->
                <div v-if="item.isActive && item.totalWeeks > 0" class="space-y-3">
                  <div class="flex justify-between items-center">
                    <span
                      class="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-wider select-none">Matriz
                      de Distribución</span>
                  </div>

                  <div
                    class="overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800/60 scrollbar-track-transparent">
                    <table class="w-full border-collapse">
                      <thead>
                        <tr class="border-b border-slate-100 dark:border-slate-800/50">
                          <th
                            class="text-left text-[9px] font-bold text-slate-400 dark:text-slate-500 pb-1.5 pr-2 select-none min-w-[70px]">
                            Plantilla</th>
                          <th
                            class="text-center text-[9px] font-bold text-slate-400 dark:text-slate-500 pb-1.5 w-5 min-w-[1.25rem] select-none"
                            :colspan="item.totalWeeks">
                            Semanas
                          </th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-slate-100 dark:divide-slate-800/40">
                        <!-- Con plantillas -->
                        <template v-if="cycleTemplates.length > 0">
                          <tr v-for="template in cycleTemplates" :key="template.id"
                            class="group/row hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                            <td class="py-1.5 pr-2 max-w-[80px] truncate select-none" :title="template.name">
                              <span
                                class="text-[10px] font-bold text-slate-600 dark:text-slate-400 group-hover/row:text-indigo-600 dark:group-hover/row:text-indigo-400 transition-colors cursor-pointer"
                                @click="openSyllabusWithTemplate(item, template.id)">
                                {{ template.name }}
                              </span>
                            </td>
                            <td v-for="w in item.totalWeeks" :key="w" class="py-1.5 text-center">
                              <div
                                class="w-4.5 h-4.5 mx-auto rounded-md flex items-center justify-center text-[8px] font-bold transition-all duration-200 select-none cursor-pointer"
                                :class="getTemplateWeekStyle(item, template.id, w).classes"
                                :title="getTemplateWeekStyle(item, template.id, w).title"
                                @click="openSyllabusWithTemplate(item, template.id)">
                                {{ w }}
                              </div>
                            </td>
                          </tr>
                        </template>
                        <!-- Sin plantillas -->
                        <tr v-else class="group/row hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                          <td class="py-1.5 pr-2 select-none">
                            <span class="text-[10px] font-bold text-slate-600 dark:text-slate-400 cursor-pointer"
                              @click="openSyllabus(item)">
                              General
                            </span>
                          </td>
                          <td v-for="w in item.totalWeeks" :key="w" class="py-1.5 text-center">
                            <div
                              class="w-4.5 h-4.5 mx-auto rounded-md flex items-center justify-center text-[8px] font-bold transition-all duration-200 select-none cursor-pointer"
                              :class="getGeneralWeekStyle(item, w).classes" :title="getGeneralWeekStyle(item, w).title"
                              @click="openSyllabus(item)">
                              {{ w }}
                            </div>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <!-- Footer: Acciones -->
              <div
                class="border-t border-slate-100 dark:border-slate-800/80 pt-4 mt-5 flex items-center justify-between gap-3">
                <!-- Clonar (Ícono Secundario) -->
                <UButton size="sm" color="neutral" variant="ghost" class="btn-premium-ghost p-2 rounded-xl shrink-0"
                  icon="i-heroicons-document-duplicate" @click="openCloneModal(item.courseId, item)"
                  title="Clonar Sílabo" />

                <!-- Editar Matriz (CTA Principal Prominente) -->
                <UButton size="sm" color="neutral"
                  class="btn-premium-primary flex-1 justify-center py-2 font-bold rounded-xl shrink-0 shadow-sm"
                  icon="i-heroicons-pencil-square" @click="openSyllabus(item)">
                  Editar Matriz
                </UButton>

                <!-- Archivar/Activar (Ícono Secundario de Peligro/Éxito) -->
                <UButton size="sm" color="neutral" variant="ghost"
                  class="btn-premium-ghost p-2 rounded-xl shrink-0 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors"
                  :icon="item.isActive ? 'i-heroicons-archive-box-arrow-down' : 'i-heroicons-arrow-path'"
                  @click="onToggleSyllabus(item.id, !item.isActive)"
                  :title="item.isActive ? 'Archivar Sílabo' : 'Activar Sílabo'" />
              </div>
            </div>
          </div>

          <!-- Estado Vacío (No hay sílabos para el ciclo o no hay ciclos) -->
          <div v-else
            class="py-24 text-center bg-white dark:bg-[#1e1e2d] rounded-2xl border border-slate-200 dark:border-slate-800/80 shadow-sm">
            <!-- CASO 1: No hay ciclos académicos creados -->
            <div v-if="timeStore.cycles.length === 0" class="max-w-md mx-auto space-y-4">
              <div
                class="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-100/50 dark:border-amber-900/50 flex items-center justify-center text-amber-500 mx-auto shadow-sm">
                <UIcon name="i-heroicons-calendar" class="w-7 h-7" />
              </div>
              <div class="space-y-1">
                <p class="text-base font-bold text-slate-800 dark:text-slate-200">No hay ciclos académicos configurados</p>
                <p class="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                  Para poder gestionar sílabos, primero debes registrar al menos un ciclo académico en el sistema.
                </p>
              </div>
              <UButton color="neutral" icon="i-heroicons-arrow-right" class="font-bold rounded-xl shadow btn-premium-primary" to="/academic-time">
                Ir a Ciclos Académicos
              </UButton>
            </div>

            <!-- CASO 2: Sí hay ciclos pero no hay sílabos para el ciclo seleccionado -->
            <div v-else class="max-w-md mx-auto space-y-4">
              <div
                class="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/50 flex items-center justify-center text-indigo-500 mx-auto shadow-sm">
                <UIcon name="i-heroicons-document-plus" class="w-7 h-7" />
              </div>
              <div class="space-y-1">
                <p class="text-base font-bold text-slate-800 dark:text-slate-200">No hay sílabos configurados</p>
                <p class="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
                  Para comenzar a planificar este ciclo, crea un nuevo sílabo vinculando un curso del catálogo.
                </p>
              </div>
              <UButton color="neutral" icon="i-heroicons-plus" class="font-bold rounded-xl shadow btn-premium-primary" @click="openCreate()">
                Crear Primer Sílabo
              </UButton>
            </div>
          </div>
        </template>
      </div>

      <!-- Leyenda / Indicador de Teclado -->
      <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-550 pt-2 select-none">
        <kbd
          class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-450 font-mono shadow-sm">⌘
          K</kbd>
        <span>o</span>
        <kbd
          class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-450 font-mono shadow-sm">/</kbd>
        <span>para enfocar el buscador de cursos</span>
      </div>
    </div>

    <SyllabusSlideOver ref="slideOverRef" />
    <CycleCloneModal ref="cycleCloneModalRef" />
    <SyllabusCloneModal ref="cloneModalRef" />
  </div>
</template>
