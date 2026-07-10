<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useMaterialsStore } from '../store/materials';
import { useCatalogsStore } from '@/features/catalogs/store';

const props = defineProps<{
  originalQuestion: any | null;
  allQuestions: any[];
}>();

const emit = defineEmits(['selected', 'cancel']);

const store = useMaterialsStore();
const catalogsStore = useCatalogsStore();

const searchedQuestion = ref<any>(null);
const searchError = ref('');
const isSearching = ref(false);
const alternativeQuestions = ref<any[]>([]);

// Advanced Search Filters
const filterTopicId = ref('');
const filterSubtopicId = ref('');
const filterLevel = ref('');

const isAddingMode = computed(() => {
  return props.originalQuestion?.status === 'EMPTY';
});

// Fetch all topics belonging to the current course from catalogsStore (fallback to allowedSyllabusUnits)
const topicOptions = computed(() => {
  const courseId = props.originalQuestion?.courseId;
  const originalTopicId = props.originalQuestion?.topicId;
  if (!courseId) return [];

  const course = catalogsStore.courses.find(c => c.id === courseId);
  const topics = course?.topics || [];

  if (topics.length > 0) {
    return topics.map(t => {
      let name = t.name;
      if (t.id === originalTopicId) {
        name += ' (Esperado)';
      }
      return { id: t.id, name };
    });
  }

  // Fallback to allowedSyllabusUnits if catalogs are not loaded yet
  if (!store.currentReview?.allowedSyllabusUnits) return [];
  const units = store.currentReview.allowedSyllabusUnits.filter(u => u.courseId === courseId);
  const topicsMap = new Map();
  units.forEach(u => {
    if (u.topicId) {
      let name = u.topicName;
      if (u.topicId === originalTopicId) {
        name += ' (Esperado)';
      }
      topicsMap.set(u.topicId, name);
    }
  });
  return Array.from(topicsMap.entries()).map(([id, name]) => ({ id, name }));
});

// Fetch all subtopics belonging to the selected topic from catalogsStore (fallback to allowedSyllabusUnits)
const subtopicOptions = computed(() => {
  const courseId = props.originalQuestion?.courseId;
  const originalSubtopicId = props.originalQuestion?.subtopicId;
  if (!courseId || !filterTopicId.value) return [];

  const course = catalogsStore.courses.find(c => c.id === courseId);
  const topic = course?.topics?.find(t => t.id === filterTopicId.value);
  const subtopics = topic?.subtopics || [];

  if (subtopics.length > 0) {
    return subtopics.map(s => {
      let name = s.name;
      if (s.id === originalSubtopicId) {
        name += ' (Esperado)';
      }
      return { id: s.id, name };
    });
  }

  // Fallback to allowedSyllabusUnits if catalogs are not loaded yet
  if (!store.currentReview?.allowedSyllabusUnits) return [];
  const units = store.currentReview.allowedSyllabusUnits.filter(
    u => u.courseId === courseId && u.topicId === filterTopicId.value
  );
  const subtopicsMap = new Map();
  units.forEach(u => {
    if (u.subtopicId) {
      let name = u.subtopicName;
      if (u.subtopicId === originalSubtopicId) {
        name += ' (Esperado)';
      }
      subtopicsMap.set(u.subtopicId, name);
    }
  });
  return Array.from(subtopicsMap.entries()).map(([id, name]) => ({ id, name }));
});

// Difficulty limits configured in the template for the current course
const activeCourseDifficultyLimit = computed(() => {
  const courseId = props.originalQuestion?.courseId;
  if (!courseId || !store.currentReview?.difficultyLimits) return null;
  return store.currentReview.difficultyLimits.find(l => l.courseId === courseId) || null;
});

// Options for difficulty filter, restricted strictly to levels configured in the template course
const levelOptions = computed(() => {
  const limit = activeCourseDifficultyLimit.value;
  const originalLevel = props.originalQuestion?.levelName || props.originalQuestion?.expectedLevel || '';
  const normOriginal = originalLevel.toUpperCase();

  const isOriginal = (level: string) => {
    if (level === 'EASY' && (normOriginal.includes('EASY') || normOriginal.includes('FÁCIL') || normOriginal.includes('FACIL'))) return true;
    if (level === 'MEDIUM' && (normOriginal.includes('MEDIUM') || normOriginal.includes('INTERMEDIO'))) return true;
    if (level === 'HARD' && (normOriginal.includes('HARD') || normOriginal.includes('AVANZADO') || normOriginal.includes('DIFÍCIL') || normOriginal.includes('DIFICIL'))) return true;
    return false;
  };

  const options = [{ id: '', name: 'Todos los permitidos' }];
  if (!limit) {
    options.push(
      { id: 'EASY', name: `Fácil${isOriginal('EASY') ? ' (Esperado)' : ''}` },
      { id: 'MEDIUM', name: `Intermedio${isOriginal('MEDIUM') ? ' (Esperado)' : ''}` },
      { id: 'HARD', name: `Avanzado${isOriginal('HARD') ? ' (Esperado)' : ''}` }
    );
    return options;
  }

  if (limit.easy > 0) {
    options.push({ id: 'EASY', name: `Fácil${isOriginal('EASY') ? ' (Esperado)' : ''}` });
  }
  if (limit.medium > 0) {
    options.push({ id: 'MEDIUM', name: `Intermedio${isOriginal('MEDIUM') ? ' (Esperado)' : ''}` });
  }
  if (limit.hard > 0) {
    options.push({ id: 'HARD', name: `Avanzado${isOriginal('HARD') ? ' (Esperado)' : ''}` });
  }
  return options;
});

// Compute IDs of questions already present in this material request
const excludeIds = computed(() => {
  if (!props.allQuestions) return [];
  return props.allQuestions
    .map(q => q.questionId)
    .filter((id): id is string => !!id && id !== props.originalQuestion?.questionId);
});

const handleTopicChange = () => {
  filterSubtopicId.value = '';
};

const initializeFilters = () => {
  // Initialize filters to match the slot's expected topic and subtopic
  filterTopicId.value = props.originalQuestion?.topicId || '';
  filterSubtopicId.value = props.originalQuestion?.subtopicId || '';

  // Map expected level string to one of EASY/MEDIUM/HARD options
  const levelName = props.originalQuestion?.levelName || props.originalQuestion?.expectedLevel || '';
  const norm = levelName.toUpperCase();
  if (norm.includes('EASY') || norm.includes('FÁCIL') || norm.includes('FACIL')) {
    filterLevel.value = 'EASY';
  } else if (norm.includes('MEDIUM') || norm.includes('INTERMEDIO')) {
    filterLevel.value = 'MEDIUM';
  } else if (norm.includes('HARD') || norm.includes('AVANZADO') || norm.includes('DIFÍCIL') || norm.includes('DIFICIL')) {
    filterLevel.value = 'HARD';
  } else {
    filterLevel.value = '';
  }
};

import { onMounted } from 'vue';

onMounted(async () => {
  searchedQuestion.value = null;
  searchError.value = '';
  alternativeQuestions.value = [];

  // Load full course syllabus topics/subtopics
  const courseId = props.originalQuestion?.courseId;
  if (courseId) {
    try {
      if (!catalogsStore.hasFetched) {
        await catalogsStore.fetchCourses();
      }
      await catalogsStore.fetchCourseTopics(courseId);
    } catch (e) {
      console.error('Error fetching course topics:', e);
    }
  }

  initializeFilters();
  await handleAdvancedSearch();
});

const handleAdvancedSearch = async () => {
  const targetTopicId = filterTopicId.value;
  const targetSubtopicId = filterSubtopicId.value;

  isSearching.value = true;
  searchError.value = '';
  alternativeQuestions.value = [];
  searchedQuestion.value = null;

  try {
    const limit = 15; // Fetch up to 15 questions
    const results = await store.fetchQuestionAlternatives(
      !targetTopicId && !targetSubtopicId ? (props.originalQuestion?.courseId || '') : '',
      targetTopicId,
      targetSubtopicId,
      filterLevel.value || '',
      limit,
      excludeIds.value
    );
    alternativeQuestions.value = results;
    if (results.length === 0) {
      searchError.value = 'No se encontraron preguntas con estos filtros.';
    }
  } catch (e: any) {
    searchError.value = e.data?.message || e.message || 'Error al buscar preguntas.';
  } finally {
    isSearching.value = false;
  }
};

const clearFilters = () => {
  filterTopicId.value = '';
  filterSubtopicId.value = '';
  filterLevel.value = '';
  handleAdvancedSearch();
};

const handleConfirm = () => {
  if (searchedQuestion.value?.questionId || searchedQuestion.value?.id) {
    emit('selected', searchedQuestion.value);
  }
};

const selectAlternative = (alt: any) => {
  searchedQuestion.value = alt;
};
</script>

<template>
  <div class="flex flex-col lg:flex-row h-full bg-slate-50 dark:bg-[#15151e] relative overflow-hidden rounded-2xl">
    
    <!-- LEFT SIDEBAR: Context & Filters -->
    <div class="w-full lg:w-[380px] xl:w-[420px] shrink-0 bg-white dark:bg-[#1a1a24] border-r border-slate-200/80 dark:border-white/5 flex flex-col z-20 shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)] dark:shadow-none">
      
      <!-- Sidebar Header (Integrates old Top Header) -->
      <div class="sticky top-0 bg-white/95 dark:bg-[#1a1a24]/95 backdrop-blur-md px-5 py-4 border-b border-slate-100 dark:border-white/5 flex items-center shrink-0 z-20">
        <div class="flex items-center gap-3">
          <UButton color="neutral" variant="soft" icon="i-heroicons-arrow-left-20-solid"
            class="rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800" @click="emit('cancel')" />
          <h3 class="text-base font-black text-slate-900 dark:text-white leading-tight tracking-tight">
            Agregar Pregunta al Slot
          </h3>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0">
        <!-- Requirements Context -->
        <div class="px-5 py-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-b border-indigo-100/50 dark:border-indigo-900/20">
          <div class="flex items-center gap-2 mb-2 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
            <UIcon name="i-heroicons-information-circle" class="w-4 h-4" /> Requisito del Slot
          </div>
          <div class="flex flex-col gap-1.5 text-xs text-slate-700 dark:text-slate-300">
            <div class="flex items-start gap-1.5">
              <UIcon name="i-heroicons-book-open" class="w-4 h-4 shrink-0 mt-0.5 text-indigo-400" />
              <span class="font-bold leading-snug">{{ props.originalQuestion?.topicName || 'N/A' }}</span>
            </div>
            <div class="flex items-start gap-1.5">
              <UIcon name="i-heroicons-bars-3-bottom-right" class="w-4 h-4 shrink-0 mt-0.5 text-indigo-400/70" />
              <span class="font-medium leading-snug opacity-90">{{ props.originalQuestion?.subtopicName || 'N/A' }}</span>
            </div>
            <div class="flex items-start gap-1.5 mt-1.5">
              <span class="px-2 py-0.5 rounded-md text-[10px] bg-white dark:bg-slate-800 font-bold border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 shadow-sm flex items-center gap-1.5">
                <div class="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                NIVEL: {{ props.originalQuestion?.expectedLevel || props.originalQuestion?.levelName || 'N/A' }}
              </span>
            </div>
          </div>
        </div>

        <!-- Filters Section -->
        <div class="p-5 space-y-4">
          <h4 class="font-black text-sm text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
            <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-slate-400 dark:text-slate-500" />
            Filtros de Búsqueda
          </h4>
          
          <div class="space-y-3.5">
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Tema del Sílabo</label>
              <USelectMenu v-model="filterTopicId" :items="topicOptions" value-key="id" label-key="name"
                placeholder="Seleccionar Tema..." class="w-full shadow-sm" :ui="{ content: 'z-popover' }"
                @update:model-value="handleTopicChange" size="md" />
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Subtema</label>
              <USelectMenu v-model="filterSubtopicId" :items="subtopicOptions" value-key="id" label-key="name"
                placeholder="Seleccionar Subtema..." :disabled="!filterTopicId" class="w-full shadow-sm"
                :ui="{ content: 'z-popover' }" size="md" />
            </div>
            <div class="space-y-1.5">
              <label class="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Nivel de Dificultad</label>
              <USelectMenu v-model="filterLevel" :items="levelOptions" value-key="id" label-key="name"
                placeholder="Seleccionar Dificultad..." class="w-full shadow-sm" :ui="{ content: 'z-popover' }" size="md" />
            </div>
          </div>

          <div class="flex flex-col gap-2 pt-5 border-t border-slate-100 dark:border-white/5 mt-5">
            <UButton size="md" color="primary" class="font-bold shadow-md shadow-indigo-500/20 rounded-xl w-full justify-center"
              @click="handleAdvancedSearch" :loading="isSearching" icon="i-heroicons-magnifying-glass">
              Buscar Preguntas
            </UButton>
            <UButton size="sm" color="neutral" variant="ghost" class="font-bold w-full justify-center text-slate-500 dark:text-slate-400 mt-1" @click="clearFilters">
              Restaurar Filtros
            </UButton>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT MAIN PANEL: Results & Confirmation -->
    <div class="flex-1 flex flex-col min-w-0 h-full bg-slate-50/50 dark:bg-[#15151e] relative">
      
      <!-- Right Header -->
      <div class="px-6 py-4 border-b border-slate-200/80 dark:border-white/5 bg-white/60 dark:bg-[#1a1a24]/60 backdrop-blur-md sticky top-0 z-10 flex justify-between items-center shrink-0">
        <div>
          <h2 class="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
            <span class="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <UIcon name="i-heroicons-rectangle-stack" class="w-5 h-5" />
            </span>
            Resultados de Búsqueda
          </h2>
          <p v-if="!isSearching && alternativeQuestions.length > 0" class="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">
            Se encontraron <strong class="text-indigo-600 dark:text-indigo-400">{{ alternativeQuestions.length }}</strong> preguntas compatibles en el banco de datos.
          </p>
        </div>
        <div v-if="searchedQuestion" class="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
          <UIcon name="i-heroicons-check-circle-20-solid" class="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span class="text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">1 Seleccionada</span>
        </div>
      </div>

      <!-- Results List -->
      <div class="flex-1 overflow-y-auto custom-scrollbar p-6">
        <!-- 1. LOADING STATE -->
        <div v-if="isSearching" class="flex flex-col items-center justify-center py-20 space-y-4">
          <UIcon name="i-heroicons-arrow-path" class="w-10 h-10 text-indigo-500 animate-spin" />
          <span class="text-sm text-slate-500 dark:text-slate-400 font-bold animate-pulse">Consultando banco de datos...</span>
        </div>

        <!-- 2. ERROR STATE -->
        <div v-else-if="searchError && searchError !== 'No se encontraron preguntas con estos filtros.'"
          class="flex flex-col items-center justify-center text-center py-16 space-y-4 max-w-md mx-auto">
          <div class="p-4 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500 ring-8 ring-rose-50 dark:ring-rose-500/5">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-10 h-10" />
          </div>
          <h5 class="text-base font-black text-slate-900 dark:text-white">Error en la Búsqueda</h5>
          <p class="text-sm text-slate-500 dark:text-slate-400">{{ searchError }}</p>
        </div>

        <!-- 3. EMPTY STATE (NO RESULTS) -->
        <div v-else-if="searchError === 'No se encontraron preguntas con estos filtros.'"
          class="flex flex-col items-center justify-center text-center py-16 space-y-4 max-w-md mx-auto">
          <div class="p-4 rounded-full bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 ring-8 ring-slate-50 dark:ring-slate-800/20">
            <UIcon name="i-heroicons-document-magnifying-glass" class="w-10 h-10" />
          </div>
          <h5 class="text-base font-black text-slate-900 dark:text-white">Sin Resultados</h5>
          <p class="text-sm text-slate-500 dark:text-slate-400">No encontramos alternativas que coincidan exactamente con estos filtros para este slot.</p>
          <UButton color="neutral" variant="soft" @click="clearFilters" class="mt-2 font-bold">
            Limpiar Filtros y Reintentar
          </UButton>
        </div>

        <!-- 4. INITIAL EMPTY STATE -->
        <div v-else-if="alternativeQuestions.length === 0"
          class="flex flex-col items-center justify-center text-center py-16 space-y-4 max-w-md mx-auto">
          <div class="p-4 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-400 dark:text-indigo-500 ring-8 ring-indigo-50 dark:ring-indigo-500/5">
            <UIcon name="i-heroicons-funnel" class="w-10 h-10" />
          </div>
          <h5 class="text-base font-black text-slate-900 dark:text-white">Esperando Búsqueda</h5>
          <p class="text-sm text-slate-500 dark:text-slate-400">Selecciona los criterios en el panel lateral y presiona "Buscar Preguntas" para ver las alternativas disponibles.</p>
        </div>

        <!-- 5. LIST OF QUESTIONS -->
        <div v-else class="space-y-4">
          <div v-for="(alt, idx) in alternativeQuestions" :key="alt.questionId"
            class="p-5 border rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 relative group overflow-hidden bg-white dark:bg-[#1a1a24]"
            :class="searchedQuestion?.questionId === alt.questionId
              ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-900/10 ring-2 ring-indigo-500/20 shadow-md shadow-indigo-500/5 dark:shadow-none'
              : 'border-slate-200 dark:border-slate-700/50 hover:border-indigo-300 dark:hover:border-indigo-800/50'"
            @click="selectAlternative(alt)">

            <!-- Accent left border -->
            <div class="absolute left-0 top-0 bottom-0 w-1.5 transition-colors duration-300" :class="searchedQuestion?.questionId === alt.questionId ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700/50 group-hover:bg-indigo-300'"></div>

            <!-- Card border glow on hover -->
            <div class="absolute -inset-px rounded-2xl border border-indigo-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

            <div v-if="searchedQuestion?.questionId === alt.questionId"
              class="absolute top-4 right-4 text-indigo-600 dark:text-indigo-400 z-10 bg-white dark:bg-[#1a1a24] rounded-full shadow-sm">
              <UIcon name="i-heroicons-check-circle-20-solid" class="w-7 h-7" />
            </div>

            <div class="relative z-10 pl-2">
              <!-- Question Metadata Tags -->
              <div class="flex flex-wrap items-center gap-2 mb-4">
                <div class="flex items-center gap-1.5 bg-slate-100/80 dark:bg-slate-800/80 px-2.5 py-1 rounded-md text-slate-600 dark:text-slate-400 font-mono border border-slate-200/50 dark:border-slate-700/50 text-[10px] tracking-tight">
                  <UIcon name="i-heroicons-qr-code" class="w-3.5 h-3.5 text-slate-400" />
                  <span class="font-bold">CÓD: {{ alt.code || alt.questionId || 'S/N' }}</span>
                </div>

                <div v-if="alt.textOrigin && alt.textOrigin !== 'Desconocido' && alt.textOrigin !== 'N/A'"
                  class="flex items-center gap-1 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 px-2.5 py-1 rounded-md border border-fuchsia-100 dark:border-fuchsia-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <UIcon name="i-heroicons-academic-cap" class="w-3.5 h-3.5" />
                  {{ alt.textOrigin }}
                </div>

                <div v-if="alt.images && alt.images.length > 0"
                  class="flex items-center gap-1 bg-cyan-50 dark:bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 px-2.5 py-1 rounded-md border border-cyan-100 dark:border-cyan-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
                  Imágenes
                </div>

                <div v-if="alt.levelName"
                  class="flex items-center gap-1 bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 px-2.5 py-1 rounded-md border border-violet-100 dark:border-violet-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <UIcon name="i-heroicons-chart-bar" class="w-3.5 h-3.5" />
                  NIVEL: {{ alt.levelName }}
                </div>

                <div class="flex items-center gap-1 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-2.5 py-1 rounded-md border border-blue-100 dark:border-blue-500/20 text-[10px] font-bold uppercase tracking-wider">
                  <UIcon name="i-heroicons-tag" class="w-3.5 h-3.5" />
                  TIPO: {{ alt.type === 'MULTIPLE_CHOICE' ? 'Opc. Múltiple' : (alt.type || 'N/A') }}
                </div>
              </div>

              <!-- Question HTML Content -->
              <div v-if="searchedQuestion?.questionId !== alt.questionId"
                class="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 prose dark:prose-invert prose-p:inline prose-img:hidden opacity-80 pr-8"
                v-html="alt.htmlContent"></div>

              <!-- Expanded view when selected -->
              <div v-else class="space-y-4 mt-3">
                <div class="text-sm leading-relaxed text-slate-800 dark:text-slate-200 max-w-none prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg"
                  v-html="alt.htmlContent"></div>

                <div v-if="alt.images && alt.images.length > 0" class="flex flex-wrap gap-3 pt-2">
                  <div v-for="img in alt.images" :key="img.id" class="border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-white dark:bg-slate-800">
                    <img :src="img.url" class="max-h-32 object-contain rounded-md" />
                  </div>
                </div>

                <div v-if="alt.options && alt.options.length > 0"
                  class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/40">
                  <div v-for="opt in alt.options" :key="opt.label"
                    class="flex items-start gap-3 p-3 rounded-xl border transition-all duration-150 shadow-sm"
                    :class="opt.isCorrect || opt.is_correct
                      ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300 ring-1 ring-emerald-500/20'
                      : 'bg-white dark:bg-[#1a1b2e] border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-400'">
                    <div class="flex items-center justify-center w-6 h-6 rounded-md font-black text-xs shrink-0 shadow-sm"
                      :class="opt.isCorrect || opt.is_correct
                        ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'">
                      {{ opt.label }}
                    </div>
                    <div class="text-sm leading-relaxed prose dark:prose-invert prose-p:my-0 prose-sm" v-html="opt.text"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="px-6 py-4 bg-white/90 dark:bg-[#1a1a24]/90 backdrop-blur-md border-t border-slate-200/80 dark:border-white/5 shrink-0 flex justify-end gap-4 sticky bottom-0 z-20 shadow-[0_-4px_15px_-3px_rgba(0,0,0,0.05)]">
        <UButton color="neutral" variant="ghost" class="font-bold rounded-xl px-5" @click="emit('cancel')">
          Cancelar
        </UButton>
        <UButton color="primary" size="lg" class="font-bold shadow-lg shadow-indigo-500/25 rounded-xl px-8"
          icon="i-heroicons-check-circle" @click="handleConfirm" :disabled="!searchedQuestion">
          Agregar Pregunta Seleccionada
        </UButton>
      </div>

    </div>
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
  background-color: rgba(156, 163, 175, 0.25);
  border-radius: 10px;
}

.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.45);
}
</style>
