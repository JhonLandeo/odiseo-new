<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useMaterialsStore } from '../store/materials';
import { useCatalogsStore } from '@/features/catalogs/store';

const props = defineProps<{
  modelValue: boolean;
  originalQuestion: any | null;
  allQuestions: any[];
}>();

const emit = defineEmits(['update:modelValue', 'selected']);

const store = useMaterialsStore();
const catalogsStore = useCatalogsStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

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

watch(isOpen, async (newVal) => {
  if (newVal) {
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
  }
});

const handleAdvancedSearch = async () => {
  let targetTopicId = filterTopicId.value;
  let targetSubtopicId = filterSubtopicId.value;
  
  if (!targetTopicId && !targetSubtopicId) {
    // If both are empty (cleared filters), search in all subtopics of the course syllabus
    const courseId = props.originalQuestion?.courseId;
    const course = catalogsStore.courses.find(c => c.id === courseId);
    const allSubtopicIds = course?.topics?.flatMap(t => t.subtopics?.map(s => s.id) || []) || [];
    
    if (allSubtopicIds.length > 0) {
      targetSubtopicId = allSubtopicIds.join(',');
    } else {
      // Fallback to current week's allowed subtopics if catalogs are not loaded or empty
      const allowedUnits = store.currentReview?.allowedSyllabusUnits?.filter(u => u.courseId === courseId) || [];
      const allowedSubtopicIds = allowedUnits.map(u => u.subtopicId).filter(Boolean);
      
      if (allowedSubtopicIds.length === 0) {
        searchError.value = 'No hay temas programados para este curso en la semana actual.';
        return;
      }
      targetSubtopicId = allowedSubtopicIds.join(',');
    }
  }
  
  isSearching.value = true;
  searchError.value = '';
  alternativeQuestions.value = [];
  searchedQuestion.value = null;

  try {
    const limit = 15; // Fetch up to 15 questions
    const results = await store.fetchQuestionAlternatives(
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
  if (searchedQuestion.value?.questionId) {
    emit('selected', searchedQuestion.value.questionId);
  }
};

const selectAlternative = (alt: any) => {
  searchedQuestion.value = alt;
};
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isOpen" class="fixed inset-0 bg-slate-950/40 dark:bg-black/50 backdrop-blur-sm z-[10005]" @click="isOpen = false" />
    </Transition>

    <Transition enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4">
      <div v-if="isOpen" class="fixed inset-0 z-[10006] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div class="bg-white dark:bg-[#151624] rounded-2xl shadow-2xl w-full max-w-5xl flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-800/80 overflow-hidden max-h-[90vh]">
          
          <!-- Glassmorphic Header -->
          <div class="sticky top-0 bg-white/95 dark:bg-[#151624]/95 backdrop-blur-md px-6 py-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between shrink-0 z-20 rounded-t-2xl">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <span class="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl flex items-center justify-center">
                <UIcon :name="isAddingMode ? 'i-heroicons-plus-circle' : 'i-heroicons-magnifying-glass-circle'" class="text-indigo-600 dark:text-indigo-400 w-5.5 h-5.5" />
              </span>
              <div>
                <span class="block leading-tight text-[15px] sm:text-base">{{ isAddingMode ? 'Agregar Pregunta al Slot Vacío' : 'Auditoría y Reemplazo de Pregunta' }}</span>
                <span class="block text-xs font-normal text-slate-500 dark:text-slate-400 mt-0.5">Syllabus-aware curation assistant</span>
              </div>
            </h3>
            <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800" @click="isOpen = false" />
          </div>

          <!-- Body Container -->
          <div class="py-5 px-6 space-y-5 overflow-y-auto max-h-[68vh] custom-scrollbar">
            
            <!-- Search Filters Section (Always Visible) -->
            <div class="space-y-4 p-5 bg-slate-50/50 dark:bg-slate-900/30 rounded-xl border border-slate-200/60 dark:border-slate-850/40">
              <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <div class="space-y-0.5">
                  <h4 class="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-indigo-550" />
                    Filtros de Búsqueda
                  </h4>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400">Filtrado inteligente basado en el sílabo de la semana académica actual.</p>
                </div>
                
                <!-- Expected requirements badge / summary -->
                <div class="text-[11px] text-slate-600 dark:text-slate-350 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 flex items-center gap-2 shadow-sm shrink-0">
                  <span class="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                    <span class="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                    Requisito Slot:
                  </span> 
                  <span class="font-semibold text-slate-800 dark:text-slate-200 max-w-[150px] truncate" :title="props.originalQuestion?.topicName">{{ props.originalQuestion?.topicName || 'N/A' }}</span>
                  <span class="text-slate-300 dark:text-slate-700">/</span>
                  <span class="font-semibold text-slate-800 dark:text-slate-200 max-w-[150px] truncate" :title="props.originalQuestion?.subtopicName">{{ props.originalQuestion?.subtopicName || 'N/A' }}</span>
                  <span class="px-2 py-0.5 rounded-md text-[10px] bg-slate-100 dark:bg-slate-800 font-bold border border-slate-200/60 dark:border-slate-700/80 text-slate-650 dark:text-slate-450">{{ props.originalQuestion?.expectedLevel || props.originalQuestion?.levelName || 'N/A' }}</span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tema del Sílabo</label>
                  <USelectMenu 
                    v-model="filterTopicId" 
                    :items="topicOptions" 
                    value-key="id" 
                    label-key="name" 
                    placeholder="Seleccionar Tema..." 
                    class="w-full"
                    @update:model-value="handleTopicChange"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Subtema</label>
                  <USelectMenu 
                    v-model="filterSubtopicId" 
                    :items="subtopicOptions" 
                    value-key="id" 
                    label-key="name" 
                    placeholder="Seleccionar Subtema..." 
                    :disabled="!filterTopicId"
                    class="w-full"
                  />
                </div>
                <div class="space-y-1.5">
                  <label class="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Nivel de Dificultad</label>
                  <USelectMenu 
                    v-model="filterLevel" 
                    :items="levelOptions" 
                    value-key="id" 
                    label-key="name" 
                    placeholder="Seleccionar Dificultad..." 
                    class="w-full"
                  />
                </div>
              </div>

              <div class="flex gap-2 justify-end pt-2 border-t border-slate-100 dark:border-slate-850/50">
                <UButton 
                  size="sm" 
                  color="neutral" 
                  variant="soft" 
                  class="font-bold rounded-lg" 
                  @click="clearFilters"
                  icon="i-heroicons-trash"
                >
                  Limpiar Filtros
                </UButton>
                <UButton 
                  size="sm" 
                  color="primary" 
                  class="font-bold shadow-md shadow-indigo-500/10 rounded-lg" 
                  @click="handleAdvancedSearch"
                  :loading="isSearching"
                  icon="i-heroicons-magnifying-glass"
                >
                  Buscar
                </UButton>
              </div>
            </div>

            <!-- Adaptive Grid: 1 Column when Adding, 2 Columns when Replacing -->
            <div :class="isAddingMode ? 'grid grid-cols-1 gap-6' : 'grid grid-cols-1 lg:grid-cols-2 gap-6'">
              
              <!-- Original Question (Left side) - Hidden in Adding Mode -->
              <div v-if="!isAddingMode" class="border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-slate-900/10 flex flex-col h-full">
                <div class="bg-slate-100/70 dark:bg-slate-900/60 px-4 py-2.5 border-b border-slate-200/80 dark:border-slate-800/80 flex justify-between items-center shrink-0">
                  <span class="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Pregunta Actual</span>
                  <span class="text-[10px] font-mono px-2.5 py-0.5 rounded bg-slate-150 dark:bg-slate-850 text-slate-650 dark:text-slate-350 border border-slate-250 dark:border-slate-750 font-bold">A Remover</span>
                </div>
                
                <div class="p-4 overflow-y-auto custom-scrollbar flex-1 max-h-[38vh]">
                  <div v-if="!originalQuestion || originalQuestion.status === 'EMPTY'" class="text-sm text-slate-400 dark:text-slate-500 italic text-center py-10">
                    Este slot está actualmente vacío.
                  </div>
                  <div v-else>
                    <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-800 dark:text-slate-200" v-html="originalQuestion.htmlContent"></div>
                    
                    <div v-if="originalQuestion.images?.length" class="mt-3 flex flex-wrap gap-2">
                      <img v-for="img in originalQuestion.images" :key="img.id" :src="img.url" class="max-h-24 object-contain rounded-lg border border-slate-200/80 dark:border-slate-750 shadow-sm" />
                    </div>

                    <div v-if="originalQuestion.options?.length" class="mt-4 grid grid-cols-1 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                      <div v-for="opt in originalQuestion.options" :key="opt.label" 
                        class="flex items-start gap-2.5 p-2.5 rounded-lg border text-sm"
                        :class="opt.isCorrect || opt.is_correct 
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300' 
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400'">
                        <span class="font-bold shrink-0 text-slate-400">{{ opt.label }})</span>
                        <div v-html="opt.text" class="prose dark:prose-invert prose-p:my-0 prose-sm"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- New Question Preview (Right side) - Takes full width in Adding Mode -->
              <div class="border border-indigo-100 dark:border-indigo-900/40 rounded-xl overflow-hidden bg-white dark:bg-[#1a1b2b] shadow-sm flex flex-col h-full relative">
                <div class="bg-indigo-50/40 dark:bg-indigo-950/20 px-4 py-2.5 border-b border-indigo-100 dark:border-indigo-950/35 flex justify-between items-center shrink-0">
                  <span class="font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Preguntas Disponibles
                  </span>
                  <span v-if="searchedQuestion" class="text-[10px] font-mono px-2.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-bold">1 seleccionada</span>
                </div>
                
                <div class="p-4 overflow-y-auto custom-scrollbar flex-1 max-h-[38vh]">
                  
                  <!-- 1. LOADING STATE -->
                  <div v-if="isSearching" class="flex flex-col items-center justify-center py-10 space-y-4">
                    <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-indigo-500 animate-spin" />
                    <span class="text-xs text-slate-550 dark:text-slate-400 font-medium animate-pulse">Buscando preguntas en el banco de datos...</span>
                  </div>

                  <!-- 2. ERROR STATE -->
                  <div v-else-if="searchError && searchError !== 'No se encontraron preguntas con estos filtros.'" class="flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div class="p-3 rounded-full bg-rose-50 dark:bg-rose-500/10 text-rose-500">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
                    </div>
                    <h5 class="text-sm font-bold text-slate-800 dark:text-slate-200">Error en la Búsqueda</h5>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-sm">{{ searchError }}</p>
                  </div>

                  <!-- 3. EMPTY STATE (NO RESULTS) -->
                  <div v-else-if="searchError === 'No se encontraron preguntas con estos filtros.'" class="flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div class="p-3 rounded-full bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-550">
                      <UIcon name="i-heroicons-document-magnifying-glass" class="w-8 h-8" />
                    </div>
                    <h5 class="text-sm font-bold text-slate-800 dark:text-slate-200">Sin Resultados</h5>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-xs">No encontramos preguntas que coincidan con estos filtros en el sílabo de la semana.</p>
                    <p class="text-[10px] text-slate-400 dark:text-slate-500">Prueba limpiando los filtros o seleccionando otra dificultad.</p>
                  </div>

                  <!-- 4. INITIAL EMPTY STATE -->
                  <div v-else-if="alternativeQuestions.length === 0" class="flex flex-col items-center justify-center text-center p-6 space-y-3">
                    <div class="p-3 rounded-full bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-550">
                      <UIcon name="i-heroicons-funnel" class="w-8 h-8" />
                    </div>
                    <h5 class="text-sm font-bold text-slate-800 dark:text-slate-200">Esperando Búsqueda</h5>
                    <p class="text-xs text-slate-500 dark:text-slate-400 max-w-xs">Ingresa criterios de filtrado y presiona "Buscar" para listar preguntas.</p>
                  </div>
                  
                  <!-- 5. LIST OF QUESTIONS -->
                  <div v-else class="space-y-3">
                    <div v-for="(alt, idx) in alternativeQuestions" :key="alt.questionId" 
                      class="p-4 border rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md relative"
                      :class="searchedQuestion?.questionId === alt.questionId 
                        ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-950/20 ring-2 ring-indigo-500/20 shadow-sm shadow-indigo-100 dark:shadow-none' 
                        : 'border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 hover:border-indigo-400 dark:hover:border-indigo-850'"
                      @click="selectAlternative(alt)">
                      
                      <div v-if="searchedQuestion?.questionId === alt.questionId" class="absolute top-3 right-3 text-indigo-600 dark:text-indigo-400">
                        <UIcon name="i-heroicons-check-circle-20-solid" class="w-5.5 h-5.5" />
                      </div>

                      <div class="flex items-center gap-2 mb-3">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800/80 text-slate-650 dark:text-slate-350 font-mono border border-slate-200/60 dark:border-slate-700/80">
                          CÓD: {{ alt.code || alt.questionId }}
                        </span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold border"
                          :class="[
                            alt.levelName?.toUpperCase() === 'HARD' || alt.levelName?.toUpperCase() === 'AVANZADO' || alt.levelName?.toUpperCase() === 'DIFÍCIL'
                              ? 'bg-rose-50 dark:bg-rose-500/10 text-rose-700 dark:text-rose-450 border-rose-100 dark:border-rose-500/25'
                              : alt.levelName?.toUpperCase() === 'MEDIUM' || alt.levelName?.toUpperCase() === 'INTERMEDIO'
                              ? 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-450 border-amber-200/60 dark:border-amber-500/25'
                              : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-450 border-emerald-200/60 dark:border-emerald-500/25'
                          ]">
                          {{ alt.levelName || 'Nivel N/A' }}
                        </span>
                      </div>
                      
                      <!-- Question HTML Content -->
                      <div v-if="searchedQuestion?.questionId !== alt.questionId" class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-500 dark:text-slate-400 line-clamp-2" v-html="alt.htmlContent"></div>
                      
                      <div v-else class="space-y-3 mt-2">
                        <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-800 dark:text-slate-100" v-html="alt.htmlContent"></div>
                        
                        <div v-if="alt.images && alt.images.length > 0" class="flex flex-wrap gap-2 pt-2">
                          <img v-for="img in alt.images" :key="img.id" :src="img.url" class="max-h-24 object-contain rounded-lg border border-slate-200 dark:border-slate-700/80 shadow-sm" />
                        </div>

                        <div v-if="alt.options && alt.options.length > 0" class="grid grid-cols-1 gap-2 mt-3 pt-2 border-t border-slate-100 dark:border-slate-800/40">
                          <div v-for="opt in alt.options" :key="opt.label" 
                            class="flex items-start gap-2.5 p-2.5 rounded-lg border text-sm transition-colors duration-150"
                            :class="opt.isCorrect || opt.is_correct 
                              ? 'bg-emerald-50/50 dark:bg-emerald-950/15 border-emerald-200 dark:border-emerald-800/30 text-emerald-800 dark:text-emerald-300' 
                              : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800/80 text-slate-650 dark:text-slate-400'">
                            <span class="font-bold shrink-0 text-slate-555 dark:text-slate-400">{{ opt.label }})</span>
                            <div v-html="opt.text" class="prose dark:prose-invert prose-p:my-0 prose-sm"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          <!-- Glassmorphic Footer -->
          <div class="sticky bottom-0 bg-white/95 dark:bg-[#151624]/95 backdrop-blur-md px-6 py-4 border-t border-slate-100 dark:border-slate-800/80 flex justify-end gap-3 shrink-0 z-20 rounded-b-2xl">
            <UButton color="neutral" variant="ghost" class="font-bold rounded-lg" @click="isOpen = false">
              Cancelar
            </UButton>
            <UButton 
              color="primary" 
              class="font-bold shadow-lg shadow-indigo-500/15 rounded-lg px-4" 
              icon="i-heroicons-check-circle" 
              @click="handleConfirm"
              :disabled="!searchedQuestion"
            >
              {{ isAddingMode ? 'Agregar Pregunta' : 'Confirmar Reemplazo' }}
            </UButton>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
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
