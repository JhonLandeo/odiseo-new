<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { useMaterialsStore } from '../store/materials';

const props = defineProps<{
  modelValue: boolean;
  originalQuestion: any | null;
  allQuestions: any[];
}>();

const emit = defineEmits(['update:modelValue', 'selected']);

const store = useMaterialsStore();

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const searchedQuestion = ref<any>(null);
const searchError = ref('');
const isSearching = ref(false);
const alternativeQuestions = ref<any[]>([]);
const searchId = ref('');
const isManualMode = ref(false); // true = Advanced/Manual search, false = Guided

// Advanced Search Filters
const filterTopicId = ref('');
const filterSubtopicId = ref('');
const filterLevel = ref('');

const topicOptions = computed(() => {
  const topicsMap = new Map();
  props.allQuestions?.forEach(q => {
    if (q.topicId) topicsMap.set(q.topicId, q.topicName);
  });
  return Array.from(topicsMap.entries()).map(([id, name]) => ({ value: id, label: name }));
});

const subtopicOptions = computed(() => {
  const subtopicsMap = new Map();
  props.allQuestions?.forEach(q => {
    if (q.topicId === filterTopicId.value && q.subtopicId) {
      subtopicsMap.set(q.subtopicId, q.subtopicName);
    }
  });
  return Array.from(subtopicsMap.entries()).map(([id, name]) => ({ value: id, label: name }));
});

const levelOptions = [
  { value: '', label: 'Todos' },
  { value: 'EASY', label: 'Fácil' },
  { value: 'MEDIUM', label: 'Intermedio' },
  { value: 'HARD', label: 'Avanzado' }
];

watch(filterTopicId, () => {
  filterSubtopicId.value = '';
});

watch(isOpen, async (newVal) => {
  if (newVal) {
    searchId.value = '';
    searchedQuestion.value = null;
    searchError.value = '';
    alternativeQuestions.value = [];
    isManualMode.value = props.originalQuestion?.status === 'EMPTY';
    
    if (isManualMode.value) {
      // Pre-fill filters with empty slot attributes
      filterTopicId.value = props.originalQuestion?.topicId || '';
      filterSubtopicId.value = props.originalQuestion?.subtopicId || '';
      filterLevel.value = props.originalQuestion?.expectedLevel || '';
      if (filterTopicId.value && filterSubtopicId.value) {
        await handleAdvancedSearch();
      }
    } else if (props.originalQuestion?.topicId && props.originalQuestion?.subtopicId) {
      await fetchAlternatives();
    }
  }
});

const fetchAlternatives = async () => {
  isSearching.value = true;
  searchError.value = '';
  try {
    const q = props.originalQuestion;
    const alternatives = await store.fetchQuestionAlternatives(
      q.topicId,
      q.subtopicId,
      q.levelId || q.expectedLevel || '' // pass empty string if no level info
    );
    
    // filter out the current question
    alternativeQuestions.value = alternatives.filter(a => a.questionId !== q.questionId);
    
    if (alternativeQuestions.value.length === 0) {
      searchError.value = 'No se encontraron alternativas disponibles para este tema y nivel.';
    }
  } catch (e: any) {
    searchError.value = e.data?.message || e.message || 'Error al cargar alternativas.';
  } finally {
    isSearching.value = false;
  }
};

const handleAdvancedSearch = async () => {
  if (!filterTopicId.value || !filterSubtopicId.value) {
    searchError.value = 'Debes seleccionar al menos un tema y subtema para buscar.';
    return;
  }
  
  isSearching.value = true;
  searchError.value = '';
  alternativeQuestions.value = [];
  searchedQuestion.value = null;

  try {
    const limit = 15; // Fetch up to 15 questions for advanced search
    const results = await store.fetchQuestionAlternatives(
      filterTopicId.value,
      filterSubtopicId.value,
      filterLevel.value || '',
      limit
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

const handleManualSearch = async () => {
  const idToSearch = searchId.value.trim();
  if (!idToSearch) return;
  
  isSearching.value = true;
  searchError.value = '';
  searchedQuestion.value = null;

  try {
    const q = await store.fetchQuestionPreview(idToSearch);
    searchedQuestion.value = q;
  } catch (e: any) {
    searchError.value = e.data?.message || e.message || 'No se encontró la pregunta o hubo un error.';
  } finally {
    isSearching.value = false;
  }
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
      <div v-if="isOpen" class="fixed inset-0 bg-slate-900/40 dark:bg-black/40 backdrop-blur-sm z-[10005]" @click="isOpen = false" />
    </Transition>

    <Transition enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4">
      <div v-if="isOpen" class="fixed inset-0 z-[10006] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div class="bg-white dark:bg-[#1a1b2e] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-800">
          
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-heroicons-magnifying-glass-circle" class="text-indigo-500 w-6 h-6" />
              {{ isManualMode ? 'Búsqueda Avanzada de Preguntas' : 'Reemplazar Pregunta (Guiado)' }}
            </h3>
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                <span>Búsqueda Libre</span>
                <UToggle v-model="isManualMode" color="indigo" @change="searchedQuestion = null; searchError = ''; alternativeQuestions = []" />
              </div>
              <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpen = false" />
            </div>
          </div>

      <div class="py-4 px-6 space-y-6 overflow-y-auto">
        
        <!-- Header Actions -->
        <div class="flex items-center justify-between" v-if="!isManualMode">
          <div class="space-y-1">
            <h4 class="font-bold text-slate-800 dark:text-slate-200">Reemplazo Guiado</h4>
            <p class="text-xs text-slate-500 dark:text-slate-400">Selecciona una de las alternativas sugeridas que cumplen con el mismo tema, subtema y dificultad.</p>
          </div>
          <UButton 
            size="sm" 
            color="white" 
            icon="i-heroicons-arrow-path"
            @click="fetchAlternatives"
            :loading="isSearching"
          >
            Refrescar opciones
          </UButton>
        </div>

        <div v-else class="space-y-4">
          <div class="space-y-1">
            <h4 class="font-bold text-slate-800 dark:text-slate-200">Filtros de Búsqueda</h4>
            <p class="text-xs text-slate-500 dark:text-slate-400">Selecciona los criterios para buscar preguntas en el banco de datos. Los temas y subtemas están limitados al sílabo actual.</p>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <USelectMenu 
              v-model="filterTopicId" 
              :options="topicOptions" 
              value-attribute="value" 
              option-attribute="label" 
              placeholder="Tema del Sílabo" 
              class="w-full"
            />
            <USelectMenu 
              v-model="filterSubtopicId" 
              :options="subtopicOptions" 
              value-attribute="value" 
              option-attribute="label" 
              placeholder="Subtema del Sílabo" 
              :disabled="!filterTopicId"
              class="w-full"
            />
            <USelectMenu 
              v-model="filterLevel" 
              :options="levelOptions" 
              value-attribute="value" 
              option-attribute="label" 
              placeholder="Nivel de Dificultad" 
              class="w-full"
            />
          </div>
          <div class="flex gap-3 items-center">
            <UButton 
              size="md" 
              color="primary" 
              class="font-bold shadow-sm" 
              @click="handleAdvancedSearch"
              :loading="isSearching"
              icon="i-heroicons-funnel"
              :disabled="!filterTopicId || !filterSubtopicId"
            >
              Aplicar Filtros
            </UButton>
            
            <span class="text-sm text-slate-400">o busca por ID exacto:</span>
            <UInput 
              v-model="searchId" 
              placeholder="ID (ej. 21956)" 
              size="sm" 
              icon="i-heroicons-hashtag"
              class="w-32 font-mono"
              @keyup.enter="handleManualSearch"
            />
            <UButton size="sm" color="white" @click="handleManualSearch" :loading="isSearching">Buscar ID</UButton>
          </div>
        </div>

        <div v-if="searchError" class="p-4 bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-200 dark:border-rose-800 flex items-center gap-2 font-medium">
          <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 shrink-0" />
          {{ searchError }}
        </div>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6" v-if="searchedQuestion || originalQuestion || isManualMode || alternativeQuestions.length > 0">
          <!-- Original Question (Left side) -->
          <div class="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-slate-50 dark:bg-slate-800/30 flex flex-col h-full">
            <div class="bg-slate-100 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center shrink-0">
              <span class="font-bold text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400">Pregunta Actual (ID: {{ originalQuestion?.questionId || 'N/A' }})</span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">A remover</span>
            </div>
            
            <div class="p-4 overflow-y-auto custom-scrollbar flex-1 max-h-[50vh]">
              <div v-if="!originalQuestion || originalQuestion.status === 'EMPTY'" class="text-sm text-slate-500 italic text-center py-10">
                Este slot está actualmente vacío.
              </div>
              <div v-else>
                <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none" v-html="originalQuestion.htmlContent"></div>
                
                <div v-if="originalQuestion.images?.length" class="mt-3 flex flex-wrap gap-2">
                  <img v-for="img in originalQuestion.images" :key="img.id" :src="img.url" class="max-h-24 object-contain rounded border border-slate-200 dark:border-slate-700" />
                </div>

                <div v-if="originalQuestion.options?.length" class="mt-4 grid grid-cols-1 gap-2">
                  <div v-for="opt in originalQuestion.options" :key="opt.label" 
                    class="flex items-start gap-2 p-2 rounded-lg border text-sm"
                    :class="opt.isCorrect || opt.is_correct ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'">
                    <span class="font-bold shrink-0">{{ opt.label }})</span>
                    <div v-html="opt.text" class="prose dark:prose-invert prose-p:my-0 prose-sm"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- New Question Preview (Right side) -->
          <div class="border border-indigo-200 dark:border-indigo-800/50 rounded-xl overflow-hidden bg-white dark:bg-[#2b2b3f] shadow-sm flex flex-col h-full relative"
               :class="{'opacity-50 pointer-events-none': !searchedQuestion && isManualMode}">
            <div class="bg-indigo-50 dark:bg-indigo-900/30 px-4 py-2 border-b border-indigo-200 dark:border-indigo-800/50 flex justify-between items-center shrink-0">
              <span class="font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-400">{{ isManualMode ? 'Pregunta a Insertar' : 'Alternativas Sugeridas' }}</span>
              <span v-if="searchedQuestion && !isManualMode" class="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold">1 seleccionada</span>
            </div>
            
            <div class="p-4 overflow-y-auto custom-scrollbar flex-1 max-h-[50vh]">
              
              <!-- Manual/Advanced Mode view -->
              <template v-if="isManualMode">
                <div v-if="alternativeQuestions.length === 0 && !searchedQuestion" class="text-sm text-slate-400 dark:text-slate-500 italic text-center py-20 flex flex-col items-center justify-center h-full">
                  <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 mb-3 opacity-20" />
                  Aplica filtros para ver preguntas disponibles o busca por ID.
                </div>
                
                <div v-if="searchedQuestion && alternativeQuestions.length === 0">
                  <div class="flex items-center justify-between mb-3">
                    <div class="flex items-center gap-2">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">CÓD: {{ searchedQuestion.code || searchedQuestion.questionId }}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">{{ searchedQuestion.levelName || 'Nivel N/A' }}</span>
                    </div>
                    <UButton size="2xs" color="emerald" @click="handleConfirm">Insertar Pregunta</UButton>
                  </div>
                  <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-800 dark:text-slate-200" v-html="searchedQuestion.htmlContent"></div>
                  <div v-if="searchedQuestion.images?.length" class="mt-3 flex flex-wrap gap-2">
                    <img v-for="img in searchedQuestion.images" :key="img.id" :src="img.url" class="max-h-32 object-contain rounded border border-slate-200 dark:border-slate-700 shadow-sm" />
                  </div>
                  <div v-if="searchedQuestion.options?.length" class="mt-4 grid gap-2" :class="searchedQuestion.configAlternative === 1 ? 'grid-cols-1' : searchedQuestion.configAlternative === 2 ? 'grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'">
                    <div v-for="opt in searchedQuestion.options" :key="opt.label" 
                      class="flex items-start gap-2 p-2.5 rounded-lg border text-sm transition-all shadow-sm"
                      :class="opt.isCorrect || opt.is_correct ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200 ring-1 ring-emerald-500/30' : 'bg-white dark:bg-[#1a1b2e] border-slate-200 dark:border-slate-700/80 text-slate-700 dark:text-slate-300 hover:border-slate-300'">
                      <span class="font-black shrink-0 text-xs" :class="opt.isCorrect || opt.is_correct ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500'">{{ opt.label }})</span>
                      <div v-html="opt.text" class="prose dark:prose-invert prose-p:my-0 prose-sm w-full"></div>
                    </div>
                  </div>
                </div>

                <!-- List of Alternatives for Advanced Search -->
                <div v-if="alternativeQuestions.length > 0" class="space-y-4">
                  <div v-for="(alt, idx) in alternativeQuestions" :key="alt.questionId" 
                    class="p-4 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md relative"
                    :class="searchedQuestion?.questionId === alt.questionId ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'"
                    @click="selectAlternative(alt)">
                    
                    <div v-if="searchedQuestion?.questionId === alt.questionId" class="absolute top-2 right-2">
                      <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-indigo-600" />
                    </div>

                    <div class="flex items-center gap-2 mb-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">CÓD: {{ alt.code || alt.questionId }}</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">{{ alt.levelName || 'Nivel N/A' }}</span>
                    </div>
                    <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-800 dark:text-slate-200 line-clamp-3" v-html="alt.htmlContent"></div>
                  </div>
                </div>
              </template>

              <!-- Guided Mode View -->
              <template v-else>
                <div v-if="isSearching" class="flex flex-col items-center justify-center h-full py-20 space-y-4">
                  <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 text-indigo-500 animate-spin" />
                  <span class="text-sm text-slate-500 font-medium">Buscando alternativas...</span>
                </div>
                <div v-else-if="alternativeQuestions.length === 0 && !searchError" class="text-sm text-slate-400 dark:text-slate-500 italic text-center py-20 flex flex-col items-center justify-center h-full">
                  <UIcon name="i-heroicons-document-magnifying-glass" class="w-12 h-12 mb-3 opacity-20" />
                  No hay alternativas sugeridas.
                </div>
                <div v-else class="space-y-4">
                  
                  <div v-for="(alt, idx) in alternativeQuestions" :key="alt.questionId" 
                    class="p-4 border rounded-xl cursor-pointer transition-all duration-200 hover:shadow-md relative"
                    :class="searchedQuestion?.questionId === alt.questionId ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20 ring-2 ring-indigo-500/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'"
                    @click="selectAlternative(alt)">
                    
                    <div v-if="searchedQuestion?.questionId === alt.questionId" class="absolute top-2 right-2">
                      <UIcon name="i-heroicons-check-circle" class="w-6 h-6 text-indigo-600" />
                    </div>

                    <div class="flex items-center gap-2 mb-3">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono border border-slate-200 dark:border-slate-700">Opción {{ String.fromCharCode(65 + idx) }} (CÓD: {{ alt.code || alt.questionId }})</span>
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-violet-50 dark:bg-violet-500/10 text-violet-700 dark:text-violet-400 border border-violet-100 dark:border-violet-500/20">{{ alt.levelName || 'Nivel N/A' }}</span>
                    </div>

                    <div class="text-sm prose dark:prose-invert prose-p:my-1 prose-img:rounded-lg max-w-none text-slate-800 dark:text-slate-200 line-clamp-3" v-html="alt.htmlContent"></div>
                  
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
          <div class="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 rounded-b-2xl">
            <UButton color="neutral" variant="ghost" class="font-bold" @click="isOpen = false">
              Cancelar
            </UButton>
            <UButton 
              color="primary" 
              class="font-bold shadow-sm" 
              icon="i-heroicons-check-circle" 
              @click="handleConfirm"
              :disabled="!searchedQuestion"
            >
              Confirmar Reemplazo
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
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 10px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}
</style>
