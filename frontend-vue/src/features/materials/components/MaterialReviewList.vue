<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useMaterialsStore } from '../store/materials';
import { useCatalogsStore } from '@/features/catalogs/store';

const props = defineProps<{
  materialId: string;
  initialCourseId?: string;
}>();

const emit = defineEmits(['approved', 'cancel']);

const store = useMaterialsStore();
const catalogsStore = useCatalogsStore();

const continueWithWarnings = ref(false);
const localReplacements = ref<Record<string, string>>({}); // reviewQuestionId -> newQuestionId
const localRemovals = ref<Set<string>>(new Set()); // set of reviewQuestionId
import MaterialQuestionSearchModal from './MaterialQuestionSearchModal.vue';
import MaterialQuestionPreviewModal from './MaterialQuestionPreviewModal.vue';

const expandedSolutions = ref<Set<string>>(new Set());
const toggleSolution = (id: string) => {
  if (expandedSolutions.value.has(id)) {
    expandedSolutions.value.delete(id);
  } else {
    expandedSolutions.value.add(id);
  }
};

const isSearchModalOpen = ref(false);
const activeSearchQuestion = ref<any>(null);

const expandedCards = ref<Set<string>>(new Set());
const expandAll = () => {
  filteredQuestions.value.forEach(q => expandedCards.value.add(q.id));
};
const collapseAll = () => {
  expandedCards.value.clear();
};
const toggleCard = (id: string) => {
  if (expandedCards.value.has(id)) {
    expandedCards.value.delete(id);
  } else {
    expandedCards.value.add(id);
  }
};

const isPreviewModalOpen = ref(false);
const activePreviewQuestion = ref<any>(null);
const openPreview = (q: any) => {
  activePreviewQuestion.value = q;
  isPreviewModalOpen.value = true;
};

const openSearch = (q: any) => {
  activeSearchQuestion.value = q;
  isSearchModalOpen.value = true;
};

const handleQuestionSelected = (newQuestionId: string) => {
  if (activeSearchQuestion.value) {
    localReplacements.value[activeSearchQuestion.value.id] = newQuestionId;
    localRemovals.value.delete(activeSearchQuestion.value.id);
  }
  isSearchModalOpen.value = false;
  activeSearchQuestion.value = null;
};

const activeTab = ref<'all' | 'empty' | 'replaced' | 'removed'>('all');
const searchQuery = ref('');
const selectedCourseId = ref(props.initialCourseId || 'all');

watch(() => props.initialCourseId, (newVal) => {
  selectedCourseId.value = newVal || 'all';
});
const currentPage = ref(1);
const itemsPerPage = 10;

onMounted(async () => {
  await store.fetchReviewData(props.materialId);
  if (catalogsStore.courses.length === 0) {
    await catalogsStore.fetchCourses();
  }
});

const reviewData = computed(() => store.currentReview);

const getCourseName = (courseId: string) => {
  const course = catalogsStore.courses.find(c => c.id === courseId);
  return course ? course.name : courseId;
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    PENDING: 'Pendiente',
    IN_REVIEW: 'En Revisión',
    PROCESSING: 'Procesando',
    REVIEW_REQUIRED: 'Revisión Requerida',
    COMPLETED: 'Completado',
    COMPLETED_WITH_WARNINGS: 'Completado con Advertencias',
    FAILED: 'Fallido',
  };
  return labels[status] || status;
};

const uniqueCourses = computed(() => {
  if (!reviewData.value) return [];
  const ids = [...new Set(reviewData.value.questions.map(q => q.courseId))];
  return ids.map(id => ({
    id,
    name: getCourseName(id)
  }));
});

const courseFilterOptions = computed(() => {
  return [
    { id: 'all', name: 'Todos los cursos' },
    ...uniqueCourses.value
  ];
});

const questions = computed(() => {
  if (!reviewData.value) return [];
  
  let validPositionCounter = 1;

  return reviewData.value.questions.map(q => {
    let currentStatus = q.status;
    let questionId = q.questionId;

    if (localRemovals.value.has(q.id)) {
      currentStatus = 'REMOVED';
    } else if (localReplacements.value[q.id]) {
      currentStatus = 'REPLACED';
      questionId = localReplacements.value[q.id];
    }

    let displayPosition = null;
    if (currentStatus !== 'REMOVED' && questionId) {
      displayPosition = validPositionCounter;
      validPositionCounter++;
    }

    return {
      ...q,
      status: currentStatus,
      questionId,
      displayPosition,
    };
  });
});

const filteredQuestions = computed(() => {
  let result = questions.value;

  // 1. Tab filter
  if (activeTab.value === 'empty') {
    result = result.filter(q => q.status === 'EMPTY');
  } else if (activeTab.value === 'replaced') {
    result = result.filter(q => q.status === 'REPLACED');
  } else if (activeTab.value === 'removed') {
    result = result.filter(q => q.status === 'REMOVED');
  }

  // 2. Course filter
  if (selectedCourseId.value !== 'all') {
    result = result.filter(q => q.courseId === selectedCourseId.value);
  }

  // 3. Search query filter
  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase().trim();
    result = result.filter(q =>
      q.topicName.toLowerCase().includes(query) ||
      q.subtopicName.toLowerCase().includes(query) ||
      (q.questionId && q.questionId.toLowerCase().includes(query))
    );
  }

  return result;
});

// Reset pagination page when filters change
watch([activeTab, selectedCourseId, searchQuery], () => {
  currentPage.value = 1;
});

const totalPages = computed(() => {
  return Math.ceil(filteredQuestions.value.length / itemsPerPage) || 1;
});

const paginatedQuestions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage;
  return filteredQuestions.value.slice(start, start + itemsPerPage);
});

const hasEmptySlots = computed(() => {
  return questions.value.some(q => q.status === 'EMPTY');
});

// Initialize expanded state for first few items when data loads
watch(reviewData, (newVal) => {
  if (newVal && expandedCards.value.size === 0) {
    // Expand first 3 cards by default
    newVal.questions.slice(0, 3).forEach(q => expandedCards.value.add(q.id));
  }
}, { immediate: true });

// Inline replacement was removed in favor of search modal

const confirmRemoveId = ref<string | null>(null);
const isRemoveModalOpen = ref(false);

const handleRemove = (questionId: string) => {
  confirmRemoveId.value = questionId;
  isRemoveModalOpen.value = true;
};

const confirmRemove = () => {
  if (confirmRemoveId.value) {
    localRemovals.value.add(confirmRemoveId.value);
    delete localReplacements.value[confirmRemoveId.value];
  }
  confirmRemoveId.value = null;
  isRemoveModalOpen.value = false;
};

const cancelRemove = () => {
  confirmRemoveId.value = null;
  isRemoveModalOpen.value = false;
};

const handleRestore = (questionId: string) => {
  localRemovals.value.delete(questionId);
  delete localReplacements.value[questionId];
};

const handleApprove = async () => {
  if (!reviewData.value) return;

  const replacementsArray = Object.entries(localReplacements.value).map(([reviewQuestionId, qId]) => ({
    reviewQuestionId,
    questionId: qId,
  }));

  const removalsArray = Array.from(localRemovals.value);

  try {
    const result = await store.approveCuration(props.materialId, {
      version: reviewData.value.version,
      continueWithWarnings: continueWithWarnings.value,
      replacements: replacementsArray,
      removals: removalsArray,
    });
    emit('approved', result);
  } catch (e) {
    console.error('Approval failed:', e);
  }
};
</script>

<template>
  <div v-if="store.isLoading && !reviewData" class="space-y-4 pt-4">
    <div class="bg-white dark:bg-[#2b2b3f] p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm">
      <div class="flex justify-between items-center">
        <USkeleton class="h-8 w-64 rounded-xl" />
        <USkeleton class="h-10 w-48 rounded-xl" />
      </div>
    </div>
    <div class="grid grid-cols-1 gap-4">
      <div v-for="i in 3" :key="i" class="bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 rounded-2xl p-5 shadow-sm">
        <div class="flex justify-between items-start gap-4">
          <div class="space-y-3 flex-1">
            <div class="flex gap-2">
              <USkeleton class="h-6 w-8 rounded" />
              <USkeleton class="h-6 w-32 rounded" />
              <USkeleton class="h-6 w-48 rounded" />
            </div>
            <div class="flex gap-2">
              <USkeleton class="h-5 w-24 rounded" />
              <USkeleton class="h-5 w-20 rounded" />
            </div>
            <USkeleton class="h-20 w-full rounded-xl mt-4" />
          </div>
          <div class="flex gap-2">
            <USkeleton class="h-8 w-24 rounded-lg" />
            <USkeleton class="h-8 w-24 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="reviewData" class="space-y-6">


    <!-- Filters: Tabs, Dropdown & Search -->
    <div
      class="bg-white dark:bg-[#2b2b3f] p-5 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm space-y-4">
      <div class="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <!-- Tab selector as capsule -->
        <div
          class="flex bg-slate-100 dark:bg-[#1a1b2e] p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-inner">
          <button v-for="tab in ['all', 'empty', 'replaced', 'removed']" :key="tab" @click="activeTab = tab as any"
            class="px-4 py-2 rounded-lg text-[11px] font-bold transition-all capitalize" :class="activeTab === tab
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200 dark:ring-slate-600'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'">
            {{ tab === 'all' ? 'Todos' : tab === 'empty' ? 'Vacantes' : tab === 'replaced' ? 'Reemplazados' :
              'Descartados' }}
          </button>
        </div>

        <!-- Filters (Search & Course) -->
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <UInput v-model="searchQuery" icon="i-heroicons-magnifying-glass" placeholder="Buscar tema, reactivo..."
            class="w-full sm:w-64" size="md">
            <template #trailing>
              <UButton v-show="searchQuery !== ''" color="neutral" variant="link" icon="i-heroicons-x-mark-20-solid"
                :padded="false" @click="searchQuery = ''" />
            </template>
          </UInput>
          <USelectMenu v-model="selectedCourseId" :items="courseFilterOptions" value-key="id" label-key="name"
            class="w-full sm:w-56" size="md" :ui="{ content: 'z-[9999]' }">
            <template #default>
              {{courseFilterOptions.find(c => c.id === selectedCourseId)?.name || 'Todos los cursos'}}
            </template>
          </USelectMenu>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row justify-between items-center text-xs text-slate-500 dark:text-slate-400 font-medium px-1">
        <span>Mostrando <strong class="text-slate-700 dark:text-slate-300">{{ filteredQuestions.length }}</strong> de
          <strong class="text-slate-700 dark:text-slate-300">{{ questions.length }}</strong> slots</span>
        
        <div class="flex items-center gap-4 mt-3 sm:mt-0">
          <div class="flex items-center gap-2">
            <UButton size="xs" color="neutral" variant="link" class="font-bold text-slate-500 hover:text-indigo-600" @click="expandAll">Expandir todo</UButton>
            <span class="text-slate-300">|</span>
            <UButton size="xs" color="neutral" variant="link" class="font-bold text-slate-500 hover:text-indigo-600" @click="collapseAll">Colapsar todo</UButton>
          </div>
          <span v-if="totalPages > 1">Página <strong class="text-slate-700 dark:text-slate-300">{{ currentPage }}</strong>
            de
            <strong class="text-slate-700 dark:text-slate-300">{{ totalPages }}</strong></span>
        </div>
      </div>
    </div>

    <!-- Question Cards List -->
    <div class="grid grid-cols-1 gap-4">
      <div v-for="q in paginatedQuestions" :key="q.id"
        class="bg-white dark:bg-[#2b2b3f] border rounded-2xl p-5 shadow-sm transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 relative group overflow-hidden"
        :class="{
          'border-slate-200 dark:border-slate-700/50': q.status === 'FOUND',
          'border-amber-200 dark:border-amber-800/50': q.status === 'EMPTY',
          'border-indigo-200 dark:border-indigo-800/50': q.status === 'REPLACED',
          'border-rose-200 dark:border-rose-800/50 opacity-80': q.status === 'REMOVED',
        }">
        <!-- Accent left border -->
        <div class="absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300" :class="{
          'bg-emerald-500': q.status === 'FOUND',
          'bg-amber-500': q.status === 'EMPTY',
          'bg-indigo-500': q.status === 'REPLACED',
          'bg-rose-500': q.status === 'REMOVED',
        }"></div>

        <!-- Card border glow on hover -->
        <div class="absolute -inset-px rounded-2xl border border-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        </div>

        <div class="space-y-4 relative z-10">
          <!-- Card Header (Always visible) -->
          <div class="group/header">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pl-1">
              <div class="space-y-2 flex-1 min-w-0">
                <!-- Hierarchy Breadcrumbs -->
                <div class="flex flex-wrap items-center gap-1.5 text-xs">
                  <span
                    class="w-6 h-6 flex items-center justify-center rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-black font-mono shadow-sm border border-slate-200/50 dark:border-slate-700/50"
                    title="Posición en el documento final">
                    {{ q.displayPosition || '-' }}
                  </span>
                <div
                  class="flex items-center gap-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-0.5 rounded-md font-bold text-[10px] uppercase tracking-wider border border-indigo-100 dark:border-indigo-500/20">
                  <UIcon name="i-heroicons-book-open" class="w-3.5 h-3.5" />
                  {{ getCourseName(q.courseId) }}
                </div>
                <UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />
                <span class="font-bold text-slate-700 dark:text-slate-200 truncate max-w-[200px] sm:max-w-[250px]"
                  :title="q.topicName">
                  {{ q.topicName }}
                </span>
                <UIcon name="i-heroicons-chevron-right" class="w-3 h-3 text-slate-300 dark:text-slate-600" />
                <span class="text-slate-500 dark:text-slate-400 font-medium truncate max-w-[150px] sm:max-w-[200px]"
                  :title="q.subtopicName">
                  {{ q.subtopicName }}
                </span>
              </div>

              <!-- Question Metadata Tags -->
              <div class="pl-8 flex flex-wrap items-center gap-2">
                <div
                  class="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/80 px-2 py-1 rounded-md text-slate-600 dark:text-slate-400 font-mono border border-slate-200/50 dark:border-slate-700/50 text-[10px] tracking-tight">
                  <UIcon name="i-heroicons-qr-code" class="w-3 h-3 text-slate-400" />
                  <span class="font-bold">CÓD: {{ q.code || q.questionId || 'S/N' }}</span>
                </div>

                <div v-if="!q.questionId"
                  class="flex items-center gap-1 text-amber-700 dark:text-amber-400 font-bold bg-amber-50 dark:bg-amber-500/10 px-2 py-1 rounded-md border border-amber-200 dark:border-amber-500/20 text-[10px]">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5" />
                  Slot Vacante
                </div>

                <div v-if="q.textOrigin && q.textOrigin !== 'Desconocido' && q.textOrigin !== 'N/A'"
                  class="flex items-center gap-1 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 px-2 py-1 rounded-md border border-fuchsia-100 dark:border-fuchsia-500/20 text-[10px] font-bold uppercase tracking-wider"
                  :title="`Origen: ${q.textOrigin}`">
                  <UIcon name="i-heroicons-academic-cap" class="w-3.5 h-3.5" />
                  {{ q.textOrigin }}
                </div>

                <div v-if="q.images && q.images.length > 0"
                  class="flex items-center gap-1 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 px-2 py-1 rounded-md border border-cyan-100 dark:border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider"
                  title="La pregunta incluye recursos gráficos">
                  <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
                  Imágenes
                </div>

                <div v-if="q.levelName || q.expectedLevel"
                  class="flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2 py-1 rounded-md border border-violet-100 dark:border-violet-500/20 text-[10px] font-bold uppercase tracking-wider"
                  :title="`Dificultad: ${q.levelName || q.expectedLevel}`">
                  <UIcon name="i-heroicons-chart-bar" class="w-3.5 h-3.5" />
                  NIVEL: {{ q.levelName || q.expectedLevel }}
                </div>

                <div
                  class="flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2 py-1 rounded-md border border-blue-100 dark:border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5" />
                  TIPO: {{ q.type === 'MULTIPLE_CHOICE' ? 'Opc. Múltiple' : (q.type || 'N/A') }}
                </div>

                <div v-if="q.options && q.options.some(o => o.is_correct || o.isCorrect)"
                  class="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-2 py-1 rounded-md border border-emerald-100 dark:border-emerald-500/20 text-[10px] font-bold uppercase tracking-wider"
                  title="Alternativa Correcta">
                  <UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5" />
                  RPTA: {{ q.options.find(o => o.is_correct || o.isCorrect)?.label }}
                </div>
              </div>
            </div>

            <!-- Status badge & Actions (Prevent collapse toggle when clicking buttons) -->
            <div class="flex items-center gap-3.5 mt-2 sm:mt-0 self-end sm:self-auto" @click.stop>
              <!-- Action buttons -->
              <div class="flex items-center gap-1">
                <UButton v-if="q.status !== 'REMOVED' && q.htmlContent" color="neutral" variant="ghost" size="xs"
                  icon="i-heroicons-eye"
                  class="font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  @click="openPreview(q)">
                  Previa PDF
                </UButton>
                <UButton v-if="q.status !== 'REMOVED'" color="neutral" variant="soft" size="xs"
                  icon="i-heroicons-magnifying-glass-circle"
                  class="font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  @click="openSearch(q)">
                  {{ q.status === 'EMPTY' ? 'Agregar Pregunta' : 'Reemplazar' }}
                </UButton>
                <UButton v-if="q.status !== 'REMOVED'" color="error" variant="ghost" size="xs" icon="i-heroicons-trash"
                  class="font-bold" @click="handleRemove(q.id)">
                  Descartar
                </UButton>
                <UButton v-else color="neutral" variant="soft" size="xs" icon="i-heroicons-arrow-uturn-left"
                  class="font-bold" @click="handleRestore(q.id)">
                  Restaurar
                </UButton>
              </div>
            </div>
          </div>

          <!-- Clamped Preview text when collapsed -->
          <div v-if="!expandedCards.has(q.id) && q.htmlContent && q.status !== 'REMOVED'" class="pl-[42px] pr-4 mt-2">
            <div class="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 prose dark:prose-invert prose-p:inline prose-img:hidden opacity-70" v-html="q.htmlContent"></div>
            <button @click.stop="toggleCard(q.id)" class="text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 mt-1 flex items-center gap-1 transition-colors">
              Ver más pregunta completa <UIcon name="i-heroicons-chevron-down" class="w-3 h-3" />
            </button>
          </div>
          </div>

          <!-- Expanded Question Content & Alternatives -->
          <div v-show="expandedCards.has(q.id) && q.status !== 'REMOVED' && q.htmlContent"
            class="pl-[42px] pr-4 pt-4 mt-2 border-t border-slate-100 dark:border-slate-800">
            <div class="flex items-start justify-between gap-4">
              <div
                class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 max-w-none prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg"
                v-html="q.htmlContent"></div>
              <button @click.stop="toggleCard(q.id)" class="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/20 px-2 py-1 rounded-md transition-colors">
                Ocultar <UIcon name="i-heroicons-chevron-up" class="w-3 h-3" />
              </button>
            </div>

            <!-- Images -->
            <div v-if="q.images && q.images.length > 0" class="mt-4 flex flex-wrap gap-4">
              <div v-for="img in q.images" :key="img.id"
                class="border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800">
                <img :src="img.url" class="max-h-32 object-contain rounded-md" alt="Question Image" />
              </div>
            </div>

            <!-- Alternatives list -->
            <div v-if="q.options && q.options.length > 0" class="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div v-for="opt in q.options" :key="opt.label"
                class="flex items-start gap-3 p-3 rounded-xl border transition-all"
                :class="opt.is_correct || opt.isCorrect
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                  : 'bg-white dark:bg-[#1a1b2e] border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'">
                <div class="flex items-center justify-center w-6 h-6 rounded-md font-black text-xs shrink-0 shadow-sm"
                  :class="opt.is_correct || opt.isCorrect
                    ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'">
                  {{ opt.label }}
                </div>
                <div class="text-sm leading-relaxed prose dark:prose-invert prose-p:my-0 prose-sm" v-html="opt.text">
                </div>
              </div>
            </div>
          </div>

          <!-- Solution Badge & Content (Independent of Card Expansion) -->
          <div v-if="q.status !== 'REMOVED'" class="px-2 mt-4">
            <div v-if="q.solution && (q.solution.diagrammed?.length > 0 || q.solution.diagrammedImages?.length > 0)" class="rounded-xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/30 dark:bg-emerald-950/10 overflow-hidden transition-all duration-300">
              <button @click.stop="toggleSolution(q.id)" class="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20 transition-colors">
                <div class="flex items-center gap-2 text-emerald-700 dark:text-emerald-400 font-bold text-xs uppercase tracking-widest">
                  <UIcon name="i-heroicons-beaker" class="w-4 h-4" />
                  Resolución y Solucionario
                </div>
                <UIcon :name="expandedSolutions.has(q.id) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" class="w-5 h-5 text-emerald-600 dark:text-emerald-500" />
              </button>
              
              <div v-show="expandedSolutions.has(q.id)" class="p-5 pt-2 border-t border-emerald-100 dark:border-emerald-800/30">
                <div class="space-y-4 relative z-10">
                  <div v-for="diag in q.solution.diagrammed" :key="diag.id" class="text-xs text-slate-700 dark:text-slate-300">
                    <div class="font-bold text-slate-900 dark:text-slate-100 mb-1.5">{{ diag.field_diagram }}</div>
                    <div v-html="diag.value" class="prose dark:prose-invert prose-sm max-w-none text-slate-700 dark:text-slate-300"></div>
                  </div>

                  <div v-if="q.solution.diagrammedImages?.length > 0" class="flex flex-wrap gap-4 mt-3 pt-4 border-t border-emerald-200/50 dark:border-emerald-800/30">
                    <div v-for="img in q.solution.diagrammedImages" :key="img.id" class="border border-white dark:border-slate-700 rounded-lg p-1.5 bg-white dark:bg-slate-900 shadow-sm">
                      <img :src="img.url" class="max-h-32 object-contain rounded-md" alt="Solution Image" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-500 dark:text-slate-400 italic">
              El solucionario no está disponible o no ha sido digitalizado para esta pregunta.
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="filteredQuestions.length === 0" class="flex flex-col items-center justify-center py-20 px-4 text-center bg-slate-50 dark:bg-slate-800/20 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700">
      <div class="w-16 h-16 mb-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <UIcon name="i-heroicons-document-magnifying-glass" class="w-8 h-8 text-slate-400" />
      </div>
      <h3 class="text-lg font-bold text-slate-900 dark:text-white mb-1">No se encontraron preguntas</h3>
      <p class="text-slate-500 dark:text-slate-400 max-w-sm">No hay preguntas en esta pestaña o coincidentes con los filtros de búsqueda actuales.</p>
      <UButton v-if="searchQuery !== '' || selectedCourseId !== 'all'" color="neutral" variant="ghost" class="mt-4 font-bold" @click="searchQuery = ''; selectedCourseId = 'all'; activeTab = 'all'">
        Limpiar filtros
      </UButton>
    </div>

    <!-- Pagination Controls -->
    <div v-if="totalPages > 1"
      class="flex justify-center items-center py-4 border-t border-slate-100 dark:border-slate-800/50 mt-4">
      <UPagination :page="currentPage" @update:page="currentPage = $event" :total="filteredQuestions.length" :items-per-page="itemsPerPage" />
    </div>
    <!-- Action Footer (Sticky) -->
    <div class="sticky bottom-4 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 bg-white/90 dark:bg-[#1a1b2e]/90 backdrop-blur-md p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-lg z-50">
      <div class="flex items-center gap-3">
        <UCheckbox 
          v-if="hasEmptySlots" 
          v-model="continueWithWarnings" 
          color="amber"
          label="Ignorar slots vacíos y compilar de todos modos" 
          class="font-medium text-amber-700 dark:text-amber-400"
        />
        <span v-else class="text-sm text-slate-500 dark:text-slate-400 font-medium flex items-center gap-2">
          <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-emerald-500" />
          Todos los slots están cubiertos
        </span>
      </div>
      
      <div class="flex items-center gap-3 w-full sm:w-auto">
        <UButton color="neutral" variant="ghost" class="font-bold flex-1 sm:flex-none justify-center" @click="$emit('cancel')">
          Cancelar
        </UButton>
        <UButton 
          color="primary" 
          size="lg" 
          class="font-bold shadow-md flex-1 sm:flex-none justify-center" 
          icon="i-heroicons-document-arrow-down" 
          :disabled="hasEmptySlots && !continueWithWarnings"
          :loading="store.isLoading"
          @click="handleApprove"
        >
          Aprobar y Compilar PDF
        </UButton>
      </div>
    </div>

    <!-- Confirm Remove Modal -->
    <Teleport to="body">
      <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
        enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100" leave-to-class="opacity-0">
        <div v-if="isRemoveModalOpen" class="fixed inset-0 bg-slate-900/40 dark:bg-black/40 backdrop-blur-sm z-[10005]" @click="cancelRemove" />
      </Transition>

      <Transition enter-active-class="transition-all duration-250 ease-out"
        enter-from-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
        leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
        leave-to-class="opacity-0 scale-95 translate-y-4">
        <div v-if="isRemoveModalOpen" class="fixed inset-0 z-[10006] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
          <div class="bg-white dark:bg-[#1a1b2e] rounded-2xl shadow-2xl w-full max-w-md flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-800">
            <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UIcon name="i-heroicons-exclamation-triangle" class="text-rose-500 w-5 h-5" />
                Descartar Pregunta
              </h3>
              <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="cancelRemove" />
            </div>
            
            <div class="px-6 py-4 text-slate-600 dark:text-slate-300">
              <p>¿Estás seguro de que deseas descartar esta pregunta del material?</p>
              <p class="text-sm mt-2 font-medium text-amber-600 dark:text-amber-400">
                El espacio quedará vacío y se omitirá en el documento final si no lo reemplazas.
              </p>
            </div>
            
            <div class="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
              <UButton color="neutral" variant="ghost" class="font-bold" @click="cancelRemove">
                Cancelar
              </UButton>
              <UButton color="error" class="font-bold shadow-sm" icon="i-heroicons-trash" @click="confirmRemove">
                Sí, Descartar
              </UButton>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Question Search Modal -->
    <MaterialQuestionSearchModal
      v-model="isSearchModalOpen"
      :original-question="activeSearchQuestion"
      :all-questions="questions"
      @selected="handleQuestionSelected"
    />

    <!-- PDF Preview Simulation Modal -->
    <MaterialQuestionPreviewModal
      v-model="isPreviewModalOpen"
      :question="activePreviewQuestion"
    />
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 10px;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
