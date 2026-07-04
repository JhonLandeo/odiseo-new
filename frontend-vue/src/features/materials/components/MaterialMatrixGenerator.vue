<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { useToast } from '#imports';
import { useRouter } from 'vue-router';
import { useAcademicTimeStore } from '@/features/academic-time/store';
import { useMaterialsStore } from '../store/materials';
import { usePdfDesignsStore } from '../store/pdfDesigns';
import { useCatalogsStore } from '@/features/catalogs/store';
import { useAuthStore } from '@/stores/auth.store';
import MaterialReviewList from '@/features/materials/components/MaterialReviewList.vue';
import PdfDesignSelector from '@/features/materials/components/PdfDesignSelector.vue';

const emit = defineEmits(['success']);

const router = useRouter();
const academicStore = useAcademicTimeStore();
const materialsStore = useMaterialsStore();
const catalogsStore = useCatalogsStore();
const pdfDesignsStore = usePdfDesignsStore();
const toast = useToast();
const authStore = useAuthStore();

const isOpen = ref(false);
const selectedCycleId = ref('');
const selectedTemplateId = ref('');
const selectedWeek = ref<number | null>(null);
const selectedDesignId = ref<string | null>(null);

const cycleHistory = ref<any[]>([]);
const showCoursesList = ref(false);
const isReviewModalOpen = ref(false);

let isProgrammaticChange = false;

const cycles = computed(() => academicStore.cycles);
const templates = computed(() => academicStore.templatesByCycle[selectedCycleId.value] ?? []);

// Reset courses list when templates or week changes
watch([selectedTemplateId, selectedWeek], () => {
  showCoursesList.value = false;
});

// Pre-fill cycles if not loaded
watch(isOpen, async (newVal) => {
  if (newVal) {
    if (cycles.value.length === 0) {
      await academicStore.fetchCycles();
    }
    if (catalogsStore.courses.length === 0) {
      await catalogsStore.fetchCourses();
    }
    // Fetch design templates
    await pdfDesignsStore.fetchDesigns();
    // Preselect default design
    const defaultDesign = pdfDesignsStore.designs.find(d => d.isDefault);
    selectedDesignId.value = defaultDesign?.id || null;
    // Try to set a default cycle if none is selected
    if (!selectedCycleId.value && cycles.value.length > 0) {
      const active = cycles.value.find(c => c.isActive);
      selectedCycleId.value = active ? active.id : cycles.value[0].id;
    }
  }
});

// Watch cycle changes to load templates and history
watch(selectedCycleId, async (newCycle) => {
  if (newCycle) {
    await academicStore.fetchTemplates(newCycle);
    if (!isProgrammaticChange) {
      selectedTemplateId.value = '';
      selectedWeek.value = null;
    }
    await fetchCycleHistory(newCycle);
  }
});

let pollingTimer: any = null;

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function startPolling(cycleId: string) {
  if (!pollingTimer) {
    pollingTimer = setInterval(async () => {
      if (isOpen.value) {
        await fetchCycleHistory(cycleId);
      } else {
        stopPolling();
      }
    }, 5000);
  }
}

onUnmounted(() => {
  stopPolling();
});

watch(isOpen, (newVal) => {
  if (!newVal) {
    stopPolling();
  } else if (selectedCycleId.value) {
    // If opened and there are processing items, might need to resume polling, handled by fetchCycleHistory
    fetchCycleHistory(selectedCycleId.value);
  }
});

async function fetchCycleHistory(cycleId: string) {
  try {
    const history = await materialsStore.fetchHistory({ cycleIds: [cycleId] });
    cycleHistory.value = history || [];
    
    // Si hay items procesando, activar el polling
    const hasProcessing = cycleHistory.value.some(h => h.status === 'PROCESSING');
    if (hasProcessing) {
      startPolling(cycleId);
    } else {
      stopPolling();
    }
  } catch (err) {
    console.error('Failed to load history for matrix:', err);
    cycleHistory.value = [];
    stopPolling();
  }
}

const weekStatusMap = computed(() => {
  const map: Record<string, string> = {};
  // Sort history ascending so the latest request overwrites previous ones
  const sortedHistory = [...cycleHistory.value].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  sortedHistory.forEach(req => {
    if (req.profileId && req.weekNumber) {
      const key = `${req.profileId}_${req.weekNumber}`;
      map[key] = req.status;
    }
  });
  return map;
});

const currentCycle = computed(() => cycles.value.find(c => c.id === selectedCycleId.value));
const weeksCount = computed(() => currentCycle.value?.totalWeeks || 16);
const weeksList = computed(() => Array.from({ length: weeksCount.value }, (_, i) => i + 1));

const selectedTemplate = computed(() => templates.value.find(t => t.id === selectedTemplateId.value));

const selectIntersection = (templateId: string, week: number) => {
  selectedTemplateId.value = templateId;
  selectedWeek.value = week;
};

const generateError = ref<string | null>(null);

const handleGenerate = async () => {
  if (!selectedTemplateId.value || !selectedWeek.value) return;

  generateError.value = null; // reset previous errors
  try {
    const coursesPayload = selectedTemplate.value?.courses.map(c => ({ course_id: c.courseId })) || [];
    const result = await materialsStore.generateMaterial({
      profile_id: selectedTemplateId.value,
      week_number: selectedWeek.value,
      requires_review: false,
      courses: coursesPayload,
      design_template_id: selectedDesignId.value || undefined,
    });
    await fetchCycleHistory(selectedCycleId.value);
    // Let them see success or generate another week
    toast.add({ title: `Semana ${selectedWeek.value}`, description: 'Generación iniciada. El worker está procesando.', color: 'success' });
    emit('success', result);
  } catch (e: any) {
    console.error('Error generating material:', e);
    // Extraemos el mensaje de error del backend (si existe en e.data.message o fallback)
    generateError.value = materialsStore.error || e?.data?.message || e?.message || 'Error desconocido al intentar generar.';
  }
};

const openWithContext = async (cycleId: string, templateId?: string, weekNumber?: number) => {
  isProgrammaticChange = true;
  if (cycles.value.length === 0) {
    await academicStore.fetchCycles();
  }
  selectedCycleId.value = cycleId;
  isOpen.value = true;
  // Ensure templates and history are fetched before selecting the intersection
  await academicStore.fetchTemplates(cycleId);
  await fetchCycleHistory(cycleId);
  if (templateId && weekNumber) {
    selectIntersection(templateId, weekNumber);
  }
  await nextTick();
  isProgrammaticChange = false;
};

const currentRequest = computed(() => {
  if (!selectedTemplateId.value || !selectedWeek.value) return null;
  const matches = cycleHistory.value.filter(
    req => req.profileId === selectedTemplateId.value && req.weekNumber === selectedWeek.value
  );
  if (matches.length === 0) return null;
  return matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
});

const getCourseName = (courseId: string) => {
  const course = catalogsStore.courses.find(c => c.id === courseId);
  return course ? course.name : courseId;
};

const allCoursesCompleted = computed(() => {
  if (!currentRequest.value?.courses) return false;
  const courses = currentRequest.value.courses;
  return courses.length >= 2 && courses.every((c: any) =>
    c.status === 'COMPLETED' || c.status === 'COMPLETED_WITH_WARNINGS'
  );
});

const activeReviewCourseId = ref<string | null>(null);

const handleAuditQuestions = () => {
  if (currentRequest.value) {
    activeReviewCourseId.value = null;
    isReviewModalOpen.value = true;
  }
};

const handleReviewCourse = (courseId: string) => {
  if (currentRequest.value) {
    activeReviewCourseId.value = courseId;
    isReviewModalOpen.value = true;
  }
};

const handleReviewApproved = (result: any) => {
  isReviewModalOpen.value = false;
  isOpen.value = false;
  emit('success', result);
};

const downloadPdf = async (course: any) => {
  if (!currentRequest.value) return;
  try {
    const response = await fetch(
      `/api/v1/materials/${currentRequest.value.id}/courses/${course.courseId}/download`,
      { headers: { 'x-subdomain': authStore.getSubdomain() } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${getCourseName(course.courseId)}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading PDF:', err);
    toast.add({ title: 'Error', description: 'Ocurrió un error al descargar el PDF.', color: 'error' });
  }
};

const downloadMergedPdf = async () => {
  if (!currentRequest.value) return;
  try {
    const response = await fetch(
      `/api/v1/materials/${currentRequest.value.id}/download-merged`,
      { headers: { 'x-subdomain': authStore.getSubdomain() } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] || 'Completo.pdf';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading merged PDF:', err);
    toast.add({ title: 'Error', description: 'Ocurrió un error al descargar el PDF combinado.', color: 'error' });
  }
};

const attemptsHistory = ref<any[]>([]);
const isLoadingHistory = ref(false);

async function fetchAttemptsForSelected() {
  if (!currentRequest.value || !currentRequest.value.materialId) {
    attemptsHistory.value = [];
    return;
  }
  
  isLoadingHistory.value = true;
  try {
    const history = await materialsStore.fetchAttempts(currentRequest.value.materialId);
    attemptsHistory.value = history || [];
  } catch (err) {
    console.error('Failed to fetch attempts history:', err);
    attemptsHistory.value = [];
  } finally {
    isLoadingHistory.value = false;
  }
}

watch(currentRequest, () => {
  fetchAttemptsForSelected();
}, { immediate: true });

const downloadMergedPdfForAttempt = async (attempt: any) => {
  if (!attempt || !attempt.mergedDownloadUrl) return;
  try {
    const response = await fetch(
      `/api/v1/materials/${attempt.id}/download-merged`,
      { headers: { 'x-subdomain': authStore.getSubdomain() } }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const contentDisposition = response.headers.get('Content-Disposition') || '';
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    const filename = filenameMatch?.[1] || 'Completo.pdf';
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('Error downloading merged PDF:', err);
    toast.add({ title: 'Error', description: 'Ocurrió un error al descargar el PDF combinado.', color: 'error' });
  }
};

function formatDate(iso: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-PE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING: 'En Cola',
    PROCESSING: 'Procesando',
    REVIEW_REQUIRED: 'Por Revisar',
    IN_REVIEW: 'En Revisión',
    COMPLETED: 'Listo',
    COMPLETED_WITH_WARNINGS: 'Parcial',
    FAILED: 'Fallido',
  };
  return labels[status] || status;
}

const goToTemplateConfig = () => {
  isOpen.value = false;
  router.push(`/academic-time/cycles/${selectedCycleId.value}/materials`);
};

defineExpose({ isOpen, openWithContext });
</script>

<template>
  <div>
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-300" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-200" leave-from-class="opacity-100"
      leave-to-class="opacity-0">
      <div v-if="isOpen" class="fixed inset-0 bg-slate-900/40 dark:bg-black/40 backdrop-blur-sm z-40"
        @click="isOpen = false" />
    </Transition>

    <Transition enter-active-class="transform transition ease-in-out duration-350" enter-from-class="translate-x-full"
      enter-to-class="translate-x-0" leave-active-class="transform transition ease-in-out duration-350"
      leave-from-class="translate-x-0" leave-to-class="translate-x-full">
      <div v-if="isOpen"
        class="fixed inset-y-0 right-0 w-full max-w-6xl bg-white dark:bg-[#11111a] shadow-2xl z-50 flex flex-col border-l border-slate-200 dark:border-white/5">
        <div class="flex flex-col h-full bg-slate-50 dark:bg-[#11111a]">
          <!-- HEADER -->
          <div
            class="px-6 py-5 bg-white dark:bg-[#1a1a24] border-b border-slate-200 dark:border-white/5 shadow-sm z-10">
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-4">
                <div
                  class="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20 shadow-inner">
                  <UIcon name="i-heroicons-squares-2x2" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h2 class="text-xl font-black text-slate-900 dark:text-white tracking-tight">Matriz de Solicitud de
                    Materiales</h2>
                  <p class="text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">Audita y genera documentos
                    masivos por semana.</p>
                </div>
              </div>
              <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="isOpen = false" />
            </div>
            <div class="mt-6 flex flex-col md:flex-row items-center gap-4">
              <div class="w-full md:w-96 relative">
                <label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1.5">Ciclo
                  Operativo</label>
                <USelectMenu v-model="selectedCycleId" :items="cycles" value-key="id" label-key="name"
                  :search-input="false" :ui="{ content: 'z-[9999]' }" placeholder="Seleccionar ciclo..." class="w-full shadow-sm" size="lg">
                  <template #default>
                    {{ currentCycle ? currentCycle.name : 'Seleccionar ciclo...' }}
                  </template>
                </USelectMenu>
              </div>
            </div>
          </div>

          <!-- BODY + DETAIL SPLIT -->
          <div class="flex-1 flex flex-col lg:flex-row min-h-0">
            <!-- MATRIX -->
            <div class="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              <div v-if="!selectedCycleId" class="py-20 text-center">
                <UIcon name="i-heroicons-arrow-down-circle"
                  class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-700 mb-4" />
                <h3 class="text-lg font-bold text-slate-500">Selecciona un Ciclo</h3>
              </div>

              <!-- Skeleton while templates load -->
              <div v-else-if="selectedCycleId && academicStore.isLoading && templates.length === 0" class="space-y-6">
                <div v-for="n in 2" :key="n"
                  class="bg-white dark:bg-[#1a1a24] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                  <div class="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/10">
                    <USkeleton class="h-4 w-48 mb-2 rounded-lg" />
                    <USkeleton class="h-3 w-28 rounded-md" />
                  </div>
                  <div class="p-5">
                    <USkeleton class="h-3 w-28 mb-3 rounded-md" />
                    <div class="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                      <USkeleton v-for="i in 16" :key="i" class="h-14 rounded-xl" />
                    </div>
                  </div>
                </div>
              </div>

              <div v-else-if="templates.length === 0" class="py-16 px-6 text-center max-w-md mx-auto flex flex-col items-center">
                <div class="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/35 flex items-center justify-center text-amber-500 mb-4 ring-8 ring-amber-500/10 animate-pulse">
                  <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8" />
                </div>
                <h3 class="text-lg font-black text-slate-800 dark:text-slate-200 tracking-tight">Sin Plantillas Configuradas</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
                  Para poder generar materiales y continuar con el flujo, es obligatorio que configures al menos una plantilla de preguntas para este ciclo académico.
                </p>
                <UButton
                  color="amber"
                  variant="solid"
                  icon="i-heroicons-cog-6-tooth"
                  class="mt-6 font-bold shadow-md shadow-amber-500/20"
                  size="md"
                  @click="goToTemplateConfig"
                >
                  Configurar Plantillas Ahora
                </UButton>
              </div>

              <!-- Matrix Layout -->
              <div v-else class="space-y-6">
                <div v-for="template in templates" :key="template.id"
                  class="bg-white dark:bg-[#1a1a24] rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm overflow-hidden">
                  <div
                    class="px-5 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-black/10 flex justify-between items-center">
                    <div>
                      <h4 class="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                        <UIcon name="i-heroicons-document-duplicate" class="w-4 h-4 text-indigo-500" />
                        {{ template.name }}
                      </h4>
                      <p class="text-xs text-slate-500 mt-0.5 ml-6">{{ template.courses.length }} cursos participan</p>
                    </div>
                  </div>

                  <div class="p-5">
                    <h5 class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Semanas del Ciclo
                    </h5>
                    <div class="grid grid-cols-5 sm:grid-cols-8 lg:grid-cols-10 gap-2">
                      <button v-for="week in weeksList" :key="week" @click="selectIntersection(template.id, week)"
                        class="relative flex flex-col items-center justify-center p-2 rounded-xl border transition-all duration-200"
                        :class="[
                          selectedTemplateId === template.id && selectedWeek === week
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-600/30 scale-105 z-10'
                            : 'bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/20',
                          weekStatusMap[`${template.id}_${week}`] === 'COMPLETED' ? 'ring-2 ring-emerald-500/50' : '',
                          weekStatusMap[`${template.id}_${week}`] === 'COMPLETED_WITH_WARNINGS' ? 'ring-2 ring-amber-500/50' : '',
                          weekStatusMap[`${template.id}_${week}`] === 'FAILED' ? 'ring-2 ring-rose-500/50' : '',
                          weekStatusMap[`${template.id}_${week}`] === 'REVIEW_REQUIRED' ? 'ring-2 ring-fuchsia-500/50' : '',
                          weekStatusMap[`${template.id}_${week}`] === 'PROCESSING' ? 'ring-2 ring-blue-400/50 animate-pulse' : '',
                        ]">
                        <span v-if="weekStatusMap[`${template.id}_${week}`]"
                          class="absolute -top-1 -right-1 w-3 h-3 rounded-full ring-2 ring-white dark:ring-[#1a1a24] z-20" :class="{
                            'bg-emerald-500': weekStatusMap[`${template.id}_${week}`] === 'COMPLETED',
                            'bg-rose-500': weekStatusMap[`${template.id}_${week}`] === 'FAILED',
                            'bg-fuchsia-500': weekStatusMap[`${template.id}_${week}`] === 'REVIEW_REQUIRED',
                            'bg-amber-400': weekStatusMap[`${template.id}_${week}`] === 'PENDING',
                            'bg-blue-400': weekStatusMap[`${template.id}_${week}`] === 'PROCESSING',
                            'bg-amber-500': weekStatusMap[`${template.id}_${week}`] === 'COMPLETED_WITH_WARNINGS',
                          }">
                        </span>
                        <span class="text-[9px] uppercase font-bold opacity-80">Sem</span>
                        <span class="text-base font-black leading-none mt-1">{{ week }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- DETAIL PANEL -->
            <Transition enter-active-class="transition ease-out duration-300"
              enter-from-class="translate-x-8 opacity-0" enter-to-class="translate-x-0 opacity-100"
              leave-active-class="transition ease-in duration-200" leave-from-class="translate-x-0 opacity-100"
              leave-to-class="translate-x-8 opacity-0">
              <div v-if="selectedTemplate && selectedWeek"
                class="w-full lg:w-80 shrink-0 bg-white dark:bg-[#1a1a24] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-white/10 overflow-y-auto">
                <Transition mode="out-in"
                  enter-active-class="transition-opacity duration-150"
                  enter-from-class="opacity-0"
                  enter-to-class="opacity-100"
                  leave-active-class="transition-opacity duration-100"
                  leave-from-class="opacity-100"
                  leave-to-class="opacity-0">
                  <div :key="`${selectedTemplate?.id}_${selectedWeek}`" class="p-5 space-y-5">
                    <!-- Header -->
                    <div class="flex items-start gap-3">
                      <div
                        class="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center border border-indigo-200 dark:border-indigo-500/30 shrink-0">
                        <UIcon name="i-heroicons-bolt" class="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <h3 class="text-base font-bold text-slate-900 dark:text-white leading-tight">
                            Semana {{ selectedWeek }}
                          </h3>
                          <span v-if="weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`]"
                            class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border shrink-0"
                            :class="{
                              'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED',
                              'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'FAILED',
                              'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-400 dark:border-fuchsia-500/20': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'REVIEW_REQUIRED',
                              'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 animate-pulse': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING',
                              'bg-amber-105 text-amber-800 border-amber-200/80 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED_WITH_WARNINGS',
                              'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20': weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PENDING'
                            }">
                            {{ weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED' ? 'Completado' :
                              weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED_WITH_WARNINGS' ? 'Parcial' :
                              weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'FAILED' ? 'Fallido' :
                                weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'REVIEW_REQUIRED' ? 'Req. Revisión'
                                  :
                                  weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING' ? 'En Proceso' :
                                    'Pendiente' }}
                          </span>
                        </div>
                        <p class="text-[11px] text-slate-500 mt-0.5">{{ selectedTemplate.name }}</p>
                      </div>
                    </div>

                    <!-- Generate Button -->
                    <button @click="handleGenerate"
                      :disabled="weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING'"
                      class="w-full flex flex-col items-center justify-center p-4 rounded-xl text-white transition-all shadow-lg group disabled:opacity-50 disabled:cursor-not-allowed"
                      :class="weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING'
                        ? 'bg-slate-400 dark:bg-slate-700 shadow-none'
                        : weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED' || weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED_WITH_WARNINGS' || weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'REVIEW_REQUIRED'
                          ? 'bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 shadow-amber-500/30'
                          : 'bg-gradient-to-br from-indigo-600 to-indigo-800 hover:from-indigo-500 hover:to-indigo-700 shadow-indigo-600/30'">
                      <UIcon
                        :name="weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING' ? 'i-heroicons-arrow-path' : 'i-heroicons-rocket-launch'"
                        class="w-7 h-7 mb-1.5 transition-transform"
                        :class="weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING' ? 'animate-spin' : 'group-hover:-translate-y-0.5'" />
                      <span class="font-black tracking-wide text-sm">
                        {{ weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'PROCESSING' ? 'GENERANDO...' :
                          weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED' ||
                            weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'COMPLETED_WITH_WARNINGS' ||
                            weekStatusMap[`${selectedTemplate.id}_${selectedWeek}`] === 'REVIEW_REQUIRED' ?
                            'VOLVER A GENERAR' :
                            'GENERAR AHORA' }}
                      </span>
                      <span class="text-[9px] opacity-80 mt-0.5 uppercase tracking-widest">{{
                        selectedTemplate.courses.length }}
                        Cursos</span>
                    </button>

                    <!-- Error Alert Box -->
                    <div v-if="generateError"
                      class="bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs p-3 rounded-lg flex gap-2 items-start">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 shrink-0 mt-0.5" />
                      <p class="font-medium leading-tight">{{ generateError }}</p>
                    </div>

                    <!-- Design Selector -->
                    <div class="border-t border-slate-200 dark:border-white/5 pt-4">
                      <PdfDesignSelector
                        v-model="selectedDesignId"
                        :course-name="selectedTemplate?.courses?.[0] ? getCourseName(selectedTemplate.courses[0].courseId) : 'Aritmética'"
                        :week-number="selectedWeek || 1"
                        :template-name="selectedTemplate?.name || 'Material'"
                        :cycle-name="currentCycle?.name || 'Ciclo'"
                      />
                    </div>

                    <!-- Actions -->
                    <button :disabled="!currentRequest" @click="handleAuditQuestions"
                      class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-amber-400 dark:hover:border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors group w-full disabled:opacity-50 disabled:cursor-not-allowed">
                      <div
                        class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                        <UIcon name="i-heroicons-magnifying-glass-circle" class="w-5 h-5" />
                      </div>
                      <div class="text-left">
                        <div class="text-sm font-bold text-slate-800 dark:text-slate-200">Revisar Preguntas</div>
                        <div class="text-[10px] text-slate-500 font-medium">Ver faltantes y estado de cobertura</div>
                      </div>
                    </button>

                    <button :disabled="!currentRequest" @click="showCoursesList = !showCoursesList"
                      class="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-fuchsia-400 dark:hover:border-fuchsia-500/50 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10 transition-colors group w-full disabled:opacity-50 disabled:cursor-not-allowed">
                      <div
                        class="w-8 h-8 rounded-lg bg-fuchsia-100 dark:bg-fuchsia-500/20 flex items-center justify-center text-fuchsia-600 dark:text-fuchsia-400 group-hover:scale-110 transition-transform">
                        <UIcon name="i-heroicons-document-magnifying-glass" class="w-5 h-5" />
                      </div>
                      <div class="text-left">
                        <div class="text-sm font-bold text-slate-800 dark:text-slate-200">Ver Cursos & PDFs</div>
                        <div class="text-[10px] text-slate-500 font-medium">Separación y descarga de archivos</div>
                      </div>
                    </button>

                    <!-- Courses List -->
                    <Transition
                      enter-active-class="transition ease-out duration-200"
                      enter-from-class="opacity-0 -translate-y-2"
                      enter-to-class="opacity-100 translate-y-0"
                      leave-active-class="transition ease-in duration-150"
                      leave-from-class="opacity-100 translate-y-0"
                      leave-to-class="opacity-0 -translate-y-2"
                    >
                      <div v-if="showCoursesList && currentRequest" class="border-t border-slate-200 dark:border-white/5 pt-4 space-y-3">
                        <h4 class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Cursos y Archivos</h4>
                        <div class="space-y-2">
                          <div v-for="course in currentRequest.courses" :key="course.courseId + '_' + course.status"
                            class="flex items-center justify-between p-3 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
                            <div class="min-w-0">
                              <span class="text-xs font-bold text-slate-800 dark:text-slate-200 block truncate">
                                {{ getCourseName(course.courseId) }}
                              </span>
                            </div>

                            <div class="flex items-center gap-2 shrink-0">
                              <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border" :class="{
                                'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20': course.status === 'COMPLETED',
                                'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20': course.status === 'COMPLETED_WITH_WARNINGS',
                                'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20': course.status === 'FAILED',
                                'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20 animate-pulse': course.status === 'PROCESSING',
                                'bg-slate-100 text-slate-600 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10': course.status === 'PENDING'
                              }">
                                {{ course.status === 'COMPLETED' ? 'Listo' :
                                  course.status === 'COMPLETED_WITH_WARNINGS' ? 'Parcial' :
                                  course.status === 'FAILED' ? 'Fallido' :
                                  course.status === 'PROCESSING' ? 'En Proceso' : 'Pendiente' }}
                              </span>

                              <span v-if="course.status === 'COMPLETED_WITH_WARNINGS'"
                                title="Generado con preguntas faltantes"
                                class="cursor-help">
                                <UIcon name="i-heroicons-exclamation-triangle" class="w-3.5 h-3.5 text-amber-500" />
                              </span>

                              <UButton size="xs" color="neutral" variant="ghost"
                                icon="i-heroicons-list-bullet" @click="handleReviewCourse(course.courseId)"
                                title="Revisar preguntas de este curso" />

                              <UButton v-if="course.status === 'COMPLETED' || course.status === 'COMPLETED_WITH_WARNINGS'" size="xs" color="primary"
                                icon="i-heroicons-arrow-down-tray" @click="downloadPdf(course)" />
                            </div>
                          </div>
                        </div>
                        <div v-if="allCoursesCompleted" class="pt-3 border-t border-slate-200 dark:border-white/5">
                          <button @click="downloadMergedPdf"
                            class="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-all duration-200 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 border border-emerald-200 dark:border-emerald-500/20">
                            <UIcon name="i-heroicons-document-arrow-down" class="w-4 h-4" />
                            Descargar PDF Combinado (Todos los cursos)
                          </button>
                        </div>
                      </div>
                    </Transition>

                    <!-- Version History -->
                    <div class="border-t border-slate-200 dark:border-white/5 pt-4 space-y-3">
                      <h4 class="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                        <UIcon name="i-heroicons-clock" class="w-3.5 h-3.5" />
                        Historial de Versiones
                      </h4>
                      <div v-if="isLoadingHistory" class="space-y-2">
                        <USkeleton class="h-10 w-full rounded-xl" v-for="i in 2" :key="i" />
                      </div>
                      <div v-else-if="attemptsHistory.length === 0" class="text-[11px] text-slate-500 dark:text-slate-400">
                        No hay versiones anteriores de este material.
                      </div>
                      <div v-else class="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                        <div v-for="attempt in attemptsHistory" :key="attempt.id" 
                          class="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-white/5 rounded-xl border border-slate-200/60 dark:border-white/10 text-xs">
                          <div class="flex flex-col min-w-0">
                            <span class="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                              Versión {{ attempt.version }}
                              <span v-if="attempt.id === currentRequest?.id" class="px-1 py-0.2 bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400 rounded text-[9px] font-black uppercase">
                                Actual
                              </span>
                            </span>
                            <span class="text-[10px] text-slate-400 dark:text-slate-500">
                              {{ formatDate(attempt.createdAt) }}
                            </span>
                          </div>
                          <div class="flex items-center gap-2">
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border shrink-0" :class="{
                              'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400': attempt.status === 'COMPLETED',
                              'bg-amber-100 text-amber-700 border-amber-250 dark:bg-amber-500/10 dark:text-amber-400': attempt.status === 'COMPLETED_WITH_WARNINGS',
                              'bg-rose-100 text-rose-700 border-rose-250 dark:bg-rose-500/10 dark:text-rose-400': attempt.status === 'FAILED',
                              'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-400 animate-pulse': attempt.status === 'PROCESSING',
                              'bg-fuchsia-105 text-fuchsia-750 border-fuchsia-200 dark:bg-fuchsia-500/10 dark:text-fuchsia-400': attempt.status === 'REVIEW_REQUIRED',
                            }">
                              {{ statusLabel(attempt.status) }}
                            </span>
                            <!-- Download only available for the active version -->
                            <UButton
                              v-if="attempt.mergedDownloadUrl && attempt.id === currentRequest?.id"
                              size="xs" color="neutral" variant="ghost"
                              icon="i-heroicons-arrow-down-tray"
                              @click="downloadMergedPdfForAttempt(attempt)"
                              title="Descargar PDF Combinado"
                            />
                            <span
                              v-else-if="attempt.mergedDownloadUrl && attempt.id !== currentRequest?.id"
                              class="text-[9px] text-slate-400 dark:text-slate-600 italic px-1"
                            >Solo referencia</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Transition>
              </div>
            </Transition>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Curation Audit Modal — UModal estándar -->
  </Teleport>

  <!-- Curation Audit Modal: teleport propio con z-[9999] para garantizar estar sobre el sidebar -->
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isReviewModalOpen"
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
        @click="isReviewModalOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-2"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-2"
    >
      <div
        v-if="isReviewModalOpen"
        class="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
      >
        <div class="bg-white dark:bg-[#1a1a24] rounded-2xl shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col border border-slate-200 dark:border-white/5 pointer-events-auto overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-6 pt-5 pb-3 border-b border-slate-200 dark:border-white/10 shrink-0">
            <div>
              <h3 class="text-base font-semibold text-slate-800 dark:text-slate-100">Auditoría de Reactivos</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Revisión y reemplazo de preguntas antes de generar el PDF</p>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="isReviewModalOpen = false" />
          </div>
          <!-- Body -->
          <div class="overflow-y-auto custom-scrollbar flex-1 px-6 pb-6">
            <MaterialReviewList
              v-if="isReviewModalOpen && currentRequest"
              :key="currentRequest.id + '_' + (activeReviewCourseId || 'all')"
              :materialId="currentRequest.id"
              :initialCourseId="activeReviewCourseId || undefined"
              @approved="handleReviewApproved"
              @cancel="isReviewModalOpen = false"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
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
