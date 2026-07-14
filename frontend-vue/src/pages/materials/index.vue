<template>
  <div class="px-8 py-6 max-w-full space-y-6">

    <!-- Sticky Header -->
    <div
      class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-700/30">
      <div class="flex items-center gap-3">
        <div
          class="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
          <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">
            Monitor de Generación
          </h1>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Centro avanzado de revisión y seguimiento de materiales académicos en tiempo real.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div
          class="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200/80 dark:border-white/5 shadow-inner">
          <button @click="currentViewMode = 'kanban'"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all" :class="currentViewMode === 'kanban'
              ? 'bg-white dark:bg-[#1a1b2e] text-indigo-650 dark:text-indigo-400 shadow-sm border border-slate-200/60 dark:border-white/5'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
            <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4" />
            Kanban
          </button>
          <button @click="currentViewMode = 'list'"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all" :class="currentViewMode === 'list'
              ? 'bg-white dark:bg-[#1a1b2e] text-indigo-650 dark:text-indigo-400 shadow-sm border border-slate-200/60 dark:border-white/5'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
            <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
            Listado
          </button>
        </div>

        <UButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-rounded-square" @click="fetchHistory"
          class="text-slate-600 font-bold dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl">
          Actualizar
        </UButton>

        <UButton id="tour-generate-material" color="neutral" variant="ghost" icon="i-heroicons-plus" size="md" class="btn-premium-primary"
          @click="openMatrixModal">
          Solicitar Material
        </UButton>
      </div>
    </div>

    <!-- Sticky Filter Bar -->
    <div
      class="sticky top-[8.5rem] z-20 bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 flex flex-col xl:flex-row items-center gap-4 shadow-md">
      <div class="w-full xl:flex-1">
        <label
          class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Ciclos
          Académicos</label>
        <USelectMenu v-model="selectedCycleIds" :items="timeStore.cycles" value-key="id" label-key="name"
          placeholder="Seleccionar ciclos..." multiple class="w-full" :search-input="true">
          <template #default>
            <span v-if="selectedCycleIds.length > 0 && selectedCycleIds.length < 3"
              class="truncate font-bold text-slate-800 dark:text-slate-200">
              {{selectedCycleIds.map(id => timeStore.cycles.find(c => c.id === id)?.name).filter(Boolean).join(', ')}}
            </span>
            <span v-else-if="selectedCycleIds.length >= 3"
              class="truncate font-bold text-slate-800 dark:text-slate-200">{{ selectedCycleIds.length }} ciclos
              seleccionados</span>
            <span v-else class="text-slate-500 dark:text-slate-400">Seleccionar ciclos...</span>
          </template>
        </USelectMenu>
      </div>

      <div class="w-full xl:w-44">
        <label
          class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Semanas</label>
        <USelectMenu v-model="selectedWeeks" :items="availableWeeksOptions" value-key="value" label-key="label"
          placeholder="Todas las semanas" multiple class="w-full">
          <template #default>
            <span v-if="selectedWeeks.length > 0 && selectedWeeks.length < 3"
              class="truncate font-bold text-slate-800 dark:text-slate-200">
              {{selectedWeeks.map(w => 'Semana ' + w).join(', ')}}
            </span>
            <span v-else-if="selectedWeeks.length >= 3" class="truncate font-bold text-slate-800 dark:text-slate-200">{{
              selectedWeeks.length }} semanas</span>
            <span v-else class="text-slate-500 dark:text-slate-400">Todas las semanas</span>
          </template>
        </USelectMenu>
      </div>

      <div class="w-full xl:w-60">
        <label
          class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Plantilla
          Integrada</label>
        <USelectMenu v-model="selectedTemplateIds" :items="availableTemplates" value-key="id" label-key="name"
          placeholder="Todas las plantillas" multiple class="w-full" :disabled="availableTemplates.length === 0">
          <template #default>
            <span v-if="selectedTemplateIds.length > 0 && selectedTemplateIds.length < 3"
              class="truncate font-bold text-slate-800 dark:text-slate-200">
              {{selectedTemplateIds.map(id => availableTemplates.find(t => t.id === id)?.name).filter(Boolean).join(',')
              }}
            </span>
            <span v-else-if="selectedTemplateIds.length >= 3"
              class="truncate font-bold text-slate-800 dark:text-slate-200">{{ selectedTemplateIds.length }}
              plantillas</span>
            <span v-else class="text-slate-500 dark:text-slate-400">Todas las plantillas</span>
          </template>
        </USelectMenu>
      </div>

      <div class="w-full xl:w-48">
        <label
          class="block text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Actividad</label>
        <USelectMenu v-model="selectedDateRange" :items="dateOptions" value-key="value" label-key="label"
          class="w-full">
          <template #default>
            <span class="truncate font-bold text-slate-700 dark:text-slate-300">
              {{dateOptions.find(o => o.value === selectedDateRange)?.label}}
            </span>
          </template>
        </USelectMenu>
      </div>
    </div>



    <!-- Skeleton Loading State -->
    <div v-if="isInitialLoading" class="space-y-6 relative z-10">
      <div v-if="currentViewMode === 'kanban'" class="flex gap-8 overflow-x-auto pb-10 pt-4 w-full">
        <div v-for="col in 4" :key="col" class="flex-1 min-w-[280px] max-w-[320px] bg-white/40 dark:bg-white/[0.02] rounded-2xl border border-slate-200/50 dark:border-white/5 p-4 space-y-4">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-3">
            <div class="flex items-center gap-2">
              <USkeleton class="w-4 h-4 rounded" />
              <USkeleton class="h-4 w-28 rounded" />
            </div>
            <USkeleton class="w-6 h-4 rounded-full" />
          </div>
          <div v-for="card in 2" :key="card" class="bg-white dark:bg-[#2b2b3f] rounded-xl border border-slate-200/50 dark:border-white/5 p-4 space-y-3 shadow-sm">
            <div class="flex justify-between items-center">
              <USkeleton class="h-3 w-16 rounded" />
              <USkeleton class="h-3.5 w-12 rounded-full" />
            </div>
            <USkeleton class="h-5 w-full rounded" />
            <div class="flex justify-between items-center pt-2">
              <USkeleton class="h-3 w-20 rounded" />
              <USkeleton class="h-4 w-12 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <div v-else class="space-y-3">
        <div v-for="row in 5" :key="row" class="bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4.5 shadow-sm flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <USkeleton class="w-8 h-8 rounded-lg" />
            <div class="space-y-1.5">
              <USkeleton class="h-3 w-24 rounded" />
              <USkeleton class="h-2 w-16 rounded" />
            </div>
          </div>
          <USkeleton class="h-4 w-28 rounded hidden sm:block" />
          <USkeleton class="h-4 w-20 rounded hidden md:block" />
          <USkeleton class="h-4 w-24 rounded-lg" />
          <USkeleton class="h-6 w-16 rounded-lg" />
        </div>
      </div>
    </div>

    <div v-else-if="filteredMaterials && filteredMaterials.length === 0"
      class="flex flex-col items-center justify-center py-10">
      <div
        class="w-20 h-20 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center mb-5 shadow-sm">
        <UIcon name="i-heroicons-sparkles" class="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
      </div>
      <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1.5 tracking-tight">Sin Materiales Generados
      </h3>
      <p
        class="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto text-center font-medium leading-relaxed mb-6">
        Aún no has generado materiales para este ciclo. Haz clic en "Solicitar Material" para comenzar la magia.
      </p>
      <UButton id="tour-generate-material" color="neutral" variant="ghost" icon="i-heroicons-plus" size="md" class="btn-premium-primary" @click="openMatrixModal">
        Solicitar Material
      </UButton>
    </div>

    <template v-else>



      <div v-if="currentViewMode === 'kanban'"
        class="flex gap-8 overflow-x-auto pb-10 pt-4 w-full snap-x custom-scrollbar relative z-10">
        <MaterialBoardColumn title="EN COLA / PROCESANDO" icon="i-heroicons-bolt"
          iconClass="text-blue-500 dark:text-blue-400"
          bgClass="bg-blue-50/20 dark:bg-blue-950/10 border-blue-200 dark:border-blue-900/30"
          :items="generatingMaterials" @clickCard="handleCardClick" />
        <MaterialBoardColumn title="POR REVISAR" icon="i-heroicons-eye"
          iconClass="text-fuchsia-500 dark:text-fuchsia-400"
          bgClass="bg-fuchsia-50/20 dark:bg-fuchsia-950/10 border-fuchsia-200 dark:border-fuchsia-900/30"
          :items="reviewMaterials" @clickCard="handleCardClick" />
        <MaterialBoardColumn title="LISTO / PUBLICADO" icon="i-heroicons-check-badge"
          iconClass="text-emerald-500 dark:text-emerald-400"
          bgClass="bg-emerald-50/20 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-900/30"
          :items="completedMaterials" @clickCard="handleCardClick" />
        <MaterialBoardColumn title="FALLIDOS / EXCEPCIONES" icon="i-heroicons-exclamation-triangle"
          iconClass="text-rose-500 dark:text-rose-400"
          bgClass="bg-rose-50/20 dark:bg-rose-950/10 border-rose-200 dark:border-rose-900/30" :items="failedMaterials"
          @clickCard="handleCardClick" />
        <div class="w-4 shrink-0"></div>
      </div>

      <div v-else-if="currentViewMode === 'list'" class="space-y-3.5 relative z-10">
        <div
          class="hidden lg:grid grid-cols-12 px-6 py-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest select-none">
          <div class="col-span-2">Tipo de Material</div>
          <div class="col-span-2">Ciclo Académico</div>
          <div class="col-span-2">Semana</div>
          <div class="col-span-2">Cursos Solicitados</div>
          <div class="col-span-2">Estado General</div>
          <div class="col-span-2 text-right">Fecha / Acciones</div>
        </div>

        <div v-for="req in filteredMaterials" :key="req.id"
          class="bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-4.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 grid grid-cols-1 lg:grid-cols-12 items-center gap-4 group cursor-pointer"
          @click="handleCardClick(req)">

          <div class="col-span-12 lg:col-span-2 flex items-center gap-3">
            <div
              class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-900/50 flex items-center justify-center text-indigo-500 dark:text-indigo-400 group-hover:scale-105 transition-transform shrink-0">
              <UIcon name="i-heroicons-document-text" class="w-4.5 h-4.5" />
            </div>
            <div>
              <span class="block font-bold text-slate-700 dark:text-slate-200 text-xs">Material Base</span>
              <span class="block text-[10px] text-slate-500 dark:text-slate-400">Plantilla vinculada</span>
            </div>
          </div>

          <div class="col-span-12 sm:col-span-4 lg:col-span-2 text-slate-700 dark:text-slate-300 font-bold text-xs">
            {{ req.cycle?.name || 'Ciclo Académico' }}
          </div>

          <div class="col-span-12 sm:col-span-4 lg:col-span-2">
            <div class="flex items-center gap-2">
              <span
                class="px-2.5 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-650 dark:text-slate-350 border border-slate-200/40 dark:border-slate-750/30">
                Semana {{ req.weekNumber }}
              </span>
              <span class="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                ({{ getWeekDates(req.cycle?.id, req.weekNumber) || 'Fechas no definidas' }})
              </span>
            </div>
          </div>

          <div class="col-span-12 sm:col-span-4 lg:col-span-2">
            <div class="flex items-center gap-2">
              <div class="flex -space-x-2">
                <div v-for="i in Math.min(3, req.courses?.length || 0)" :key="i"
                  class="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 border border-white dark:border-[#2b2b3f] flex items-center justify-center text-slate-500 dark:text-slate-400 shadow-sm">
                  <UIcon name="i-heroicons-academic-cap" class="w-3 h-3" />
                </div>
              </div>
              <span class="text-xs font-bold text-slate-600 dark:text-slate-300">
                {{ req.courses?.length || 0 }} cursos
              </span>
            </div>
          </div>

          <div class="col-span-12 sm:col-span-6 lg:col-span-2">
            <div class="flex items-center gap-2">
              <span class="w-2 h-2 rounded-full" :class="statusColorClass(req.status)"></span>
              <span class="text-xs uppercase tracking-wider font-black" :class="statusTextClass(req.status)">
                {{ statusLabel(req.status) }}
              </span>
            </div>
          </div>

          <div
            class="col-span-12 sm:col-span-6 lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 text-right">
            <span class="text-[11px] text-slate-450 dark:text-slate-500 font-semibold lg:hidden">Fecha:</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 font-semibold mr-1 hidden lg:inline">
              {{ formatDate(req.createdAt) }}
            </span>
            <UButton size="xs" color="neutral" variant="ghost" icon="i-heroicons-eye" class="btn-premium-soft font-bold rounded-lg"
              @click.stop="handleCardClick(req)">
              Detalle
            </UButton>
          </div>
        </div>
      </div>
    </template>

    <MaterialMatrixGenerator ref="matrixGeneratorRef" @success="handleGenerateSuccess" />

    <!-- Keyboard Hint -->
    <div class="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 pt-2 select-none">
      <kbd class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">⌘ K</kbd>
      <span>o</span>
      <kbd class="inline-flex h-5 items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-2 text-[10px] font-bold text-slate-400 font-mono shadow-sm">/</kbd>
      <span>para enfocar el buscador de cursos</span>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { useAcademicTimeStore } from '@/features/academic-time/store';
import { useMaterialsStore } from '@/features/materials/store/materials';
import { useCatalogsStore } from '@/features/catalogs/store';
import MaterialBoardColumn from '@/features/materials/components/MaterialBoardColumn.vue';
import MaterialMatrixGenerator from '@/features/materials/components/MaterialMatrixGenerator.vue';
import { useMaterialWebSocket } from '@/features/materials/composables/useMaterialWebSocket';

definePageMeta({
  layout: 'b2b',
  permissions: ['generate_material']
});

useMaterialWebSocket().connect();

const materials = ref<any[]>([]);
const isInitialLoading = ref(true);
const authStore = useAuthStore();
const timeStore = useAcademicTimeStore();
const materialsStore = useMaterialsStore();
const catalogsStore = useCatalogsStore();
const matrixGeneratorRef = ref<any>(null);

const currentViewMode = ref<'kanban' | 'list'>('kanban');

const loading = computed(() => materialsStore.isLoading);

function getCourseShortName(courseId: string): string {
  const course = catalogsStore.courses.find(c => c.id === courseId);
  return course ? course.name : courseId.slice(0, 4).toUpperCase();
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'En Cola',
    PROCESSING: 'Procesando',
    REVIEW_REQUIRED: 'Por Revisar',
    IN_REVIEW: 'En Revisión',
    COMPLETED: 'Completado',
    COMPLETED_WITH_WARNINGS: 'Parcial',
    FAILED: 'Fallido',
  };
  return labels[status] || status;
}

function statusColorClass(status: string) {
  switch (status) {
    case 'PENDING': return 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]';
    case 'PROCESSING': return 'bg-blue-400 animate-pulse shadow-[0_0_10px_rgba(96,165,250,0.8)]';
    case 'REVIEW_REQUIRED':
    case 'IN_REVIEW': return 'bg-fuchsia-500 shadow-[0_0_10px_rgba(217,70,239,0.6)]';
    case 'COMPLETED': return 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.6)]';
    case 'COMPLETED_WITH_WARNINGS': return 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.6)]';
    case 'FAILED': return 'bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.6)]';
    default: return 'bg-slate-400';
  }
}

function statusTextClass(status: string) {
  switch (status) {
    case 'PENDING': return 'text-amber-500';
    case 'PROCESSING': return 'text-blue-500';
    case 'REVIEW_REQUIRED':
    case 'IN_REVIEW': return 'text-fuchsia-500';
    case 'COMPLETED': return 'text-emerald-500';
    case 'COMPLETED_WITH_WARNINGS': return 'text-amber-500';
    case 'FAILED': return 'text-rose-500';
    default: return 'text-slate-500';
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getWeekDates(cycleId: string | undefined, weekNumber: number): string {
  if (!cycleId) return '';
  const cycle = timeStore.cycles.find(c => c.id === cycleId);
  if (!cycle || !cycle.weeks) return '';
  const week = cycle.weeks.find(w => w.weekNumber === weekNumber);
  if (!week) return '';
  const start = new Date(week.startDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
  const end = new Date(week.endDate).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' });
  return `${start} al ${end}`;
}

// Filters State
const selectedCycleIds = ref<string[]>([]);
const selectedWeeks = ref<number[]>([]);
const selectedTemplateIds = ref<string[]>([]);

// Operative Filters State
const selectedDateRange = ref<string>('ALL');
const dateOptions = [
  { value: 'ALL', label: 'Todo el historial' },
  { value: 'TODAY', label: 'Generados Hoy' },
  { value: 'LAST_7', label: 'Últimos 7 días' },
];

const availableWeeksOptions = Array.from({ length: 40 }, (_, i) => ({ value: i + 1, label: `Semana ${i + 1}` }));

// Compute all available templates from the selected cycles
const availableTemplates = computed(() => {
  const list: any[] = [];
  for (const cid of selectedCycleIds.value) {
    const cycleTemplates = timeStore.templatesByCycle[cid];
    if (cycleTemplates) {
      cycleTemplates.forEach(t => {
        const cname = timeStore.cycles.find(c => c.id === cid)?.name || 'Ciclo';
        list.push({
          id: t.id,
          name: `${t.name} (${cname})`
        });
      });
    }
  }
  return list;
});

// Computed Operative Filter
const filteredMaterials = computed(() => {
  let result = materials.value;

  // Filter by Creation Date
  if (selectedDateRange.value !== 'ALL') {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (selectedDateRange.value === 'TODAY') {
      result = result.filter(m => m.createdAt.startsWith(todayStr));
    } else if (selectedDateRange.value === 'LAST_7') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(now.getDate() - 7);
      result = result.filter(m => new Date(m.createdAt) >= sevenDaysAgo);
    }
  }

  return result;
});

// Kanban Board Computed Properties
const generatingMaterials = computed(() => filteredMaterials.value.filter(m => ['PENDING', 'PROCESSING'].includes(m.status)));
const reviewMaterials = computed(() => filteredMaterials.value.filter(m => ['REVIEW_REQUIRED', 'IN_REVIEW'].includes(m.status)));
const completedMaterials = computed(() => filteredMaterials.value.filter(m => ['COMPLETED', 'COMPLETED_WITH_WARNINGS'].includes(m.status)));
const failedMaterials = computed(() => filteredMaterials.value.filter(m => m.status === 'FAILED'));

// LocalStorage Persistence for Filters
const saveFiltersToLocal = () => {
  localStorage.setItem('materials_selected_cycles', JSON.stringify(selectedCycleIds.value));
  localStorage.setItem('materials_selected_weeks', JSON.stringify(selectedWeeks.value));
  localStorage.setItem('materials_selected_templates', JSON.stringify(selectedTemplateIds.value));
};

const loadFiltersFromLocal = () => {
  try {
    const savedCycles = localStorage.getItem('materials_selected_cycles');
    if (savedCycles) {
      const parsed = JSON.parse(savedCycles);
      if (Array.isArray(parsed)) {
        // Only keep cycle IDs that actually exist in the current database list
        selectedCycleIds.value = parsed.filter((id: string) =>
          timeStore.cycles.some(c => c.id === id)
        );
      }
    }

    const savedWeeks = localStorage.getItem('materials_selected_weeks');
    if (savedWeeks) selectedWeeks.value = JSON.parse(savedWeeks);

    const savedTemplates = localStorage.getItem('materials_selected_templates');
    if (savedTemplates) {
      const parsed = JSON.parse(savedTemplates);
      if (Array.isArray(parsed)) {
        selectedTemplateIds.value = parsed;
      }
    }
  } catch (e) {
    console.error('Failed to parse local filters', e);
  }
};

async function fetchHistory() {
  const query = {
    cycleIds: selectedCycleIds.value.length ? selectedCycleIds.value : undefined,
    templateIds: selectedTemplateIds.value.length ? selectedTemplateIds.value : undefined,
    weekNumbers: selectedWeeks.value.length ? selectedWeeks.value : undefined,
  };

  try {
    const history = await materialsStore.fetchHistory(query);
    materials.value = history;
  } catch (error) {
    console.error('Error fetching materials history:', error);
  } finally {
    isInitialLoading.value = false;
  }
}

watch(selectedCycleIds, async (newCycles, oldCycles) => {
  if (newCycles.length > 0) {
    // Fetch templates for the newly added cycles
    const toFetch = newCycles.filter(c => !timeStore.templatesByCycle[c]);
    await Promise.all(toFetch.map(cid => timeStore.fetchTemplates(cid)));

    // Clean up template selections that don't belong to any active cycle templates
    selectedTemplateIds.value = selectedTemplateIds.value.filter(id =>
      availableTemplates.value.some(t => t.id === id)
    );
  }

  // Clean up selected templates that belong to cycles no longer selected
  if (oldCycles) {
    const removedCycles = oldCycles.filter(c => !newCycles.includes(c));
    removedCycles.forEach(cid => {
      const orphanTemplates = timeStore.templatesByCycle[cid] || [];
      const orphanIds = orphanTemplates.map((t: any) => t.id);
      selectedTemplateIds.value = selectedTemplateIds.value.filter(id => !orphanIds.includes(id));
    });
  }
});

watch([selectedCycleIds, selectedWeeks, selectedTemplateIds], () => {
  saveFiltersToLocal();
  fetchHistory();
}, { deep: true });

onMounted(async () => {
  await timeStore.fetchCycles();
  if (catalogsStore.courses.length === 0) {
    await catalogsStore.fetchCourses();
  }
  loadFiltersFromLocal();

  // Fallback to active cycle if no filters saved
  if (selectedCycleIds.value.length === 0 && timeStore.cycles.length > 0) {
    const activeCycle = timeStore.cycles.find(c => c.isActive) ?? timeStore.cycles[0];
    selectedCycleIds.value = [activeCycle.id];
  } else {
    // If cycles were loaded from cache, ensure templates are fetched before running history
    await Promise.all(selectedCycleIds.value.map(cid => timeStore.fetchTemplates(cid)));
    fetchHistory();
  }

  // Poll status every 8 seconds for real-time dashboard responsiveness
  const interval = setInterval(fetchHistory, 8000);
  onUnmounted(() => clearInterval(interval));
});

function openMatrixModal() {
  if (matrixGeneratorRef.value) {
    if (selectedCycleIds.value.length > 0) {
      matrixGeneratorRef.value.openWithContext(selectedCycleIds.value[0]);
    } else {
      matrixGeneratorRef.value.isOpen = true;
    }
  }
}

function handleGenerateSuccess() {
  fetchHistory();
}

function handleCardClick(request: any) {
  if (matrixGeneratorRef.value) {
    const cycleId = request.cycle?.id || selectedCycleIds.value[0];
    const templateId = request.profileId;
    matrixGeneratorRef.value.openWithContext(cycleId, templateId, request.weekNumber);
  }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569;
}
</style>
