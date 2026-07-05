<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useSyllabusStore } from '../store';
import { useAcademicTimeStore } from '../../academic-time/store';
import { useCatalogsStore } from '../../catalogs/store';
import SyllabusSubtopicSlideOver from './SyllabusSubtopicSlideOver.vue';
import { useToast } from '#imports';

const store = useSyllabusStore();
const timeStore = useAcademicTimeStore();
const catalogsStore = useCatalogsStore();
const toast = useToast();

const generatedWeeks = computed(() => store.generatedWeeks);

function isGeneratedWeek(weekNumber: number) {
  return generatedWeeks.value.includes(weekNumber);
}

const syllabus = computed(() => store.syllabus);
const slideOverRef = ref<InstanceType<typeof SyllabusSubtopicSlideOver> | null>(null);
const matrixSearchQuery = ref('');
const savingCells = ref<Set<string>>(new Set());

const selectedTemplateId = ref<string>('');

const templates = computed(() => {
  const cycleId = syllabus.value?.cycleId;
  return cycleId ? timeStore.templatesByCycle[cycleId] || [] : [];
});

const selectedTemplate = computed(() => {
  return templates.value.find(t => t.id === selectedTemplateId.value) || null;
});

const targetQuestionsQuantity = computed(() => {
  if (!selectedTemplate.value || !syllabus.value?.courseId) return null;
  const courseConfig = selectedTemplate.value.courses?.find(c => c.courseId === syllabus.value.courseId);
  return courseConfig ? courseConfig.questionsQuantity : null;
});

watch(() => [templates.value, syllabus.value?.templateId, store.activeTemplateId], ([newTemplates, savedTemplateId, activeId]) => {
  if (activeId && newTemplates.some(t => t.id === activeId)) {
    selectedTemplateId.value = activeId as string;
  } else if (savedTemplateId && newTemplates.some(t => t.id === savedTemplateId)) {
    selectedTemplateId.value = savedTemplateId as string;
  } else if (newTemplates.length > 0 && !selectedTemplateId.value) {
    selectedTemplateId.value = newTemplates[0].id;
  }
}, { immediate: true });

const loadDistributions = async () => {
  if (!syllabus.value?.id || !selectedTemplateId.value) return;
  await store.fetchSummary(syllabus.value.id, selectedTemplateId.value);
};

// Watches template changes and saves selection
watch(selectedTemplateId, async (newId) => {
  if (newId && syllabus.value?.id) {
    if (newId !== store.activeTemplateId) {
      store.activeTemplateId = newId;
    }
    if (newId !== syllabus.value.templateId) {
      try {
        await store.setTemplate(syllabus.value.id, newId);
        if (syllabus.value?.cycleId) {
          await timeStore.fetchTemplates(syllabus.value.cycleId);
        }
        await loadDistributions();
      } catch (error) {
        console.error('Error changing syllabus template:', error);
      }
    }
  }
});

watch(() => syllabus.value?.id, async (newId) => {
  if (newId) {
    await loadDistributions();
    if (syllabus.value?.courseId) {
      await catalogsStore.fetchCourseTopics(syllabus.value.courseId);
    }
    if (syllabus.value?.cycleId) {
      await timeStore.fetchTemplates(syllabus.value.cycleId);
    }
  }
}, { immediate: true });

const cycle = computed(() => timeStore.cycles.find(c => c.id === syllabus.value?.cycleId));
const totalWeeks = computed(() => cycle.value?.totalWeeks || 16);
const course = computed(() => catalogsStore.courses.find(c => c.id === syllabus.value?.courseId));

interface RowData {
  topicId: string;
  subtopicId: string;
  topicName: string;
  subtopicName: string;
  topicIsActive: boolean;
}

interface TopicGroup {
  topicId: string;
  topicName: string;
  topicIsActive: boolean;
  rows: RowData[];
  subtotalByWeek: Record<number, number>;
  subtotal: number;
}

const localRows = ref<RowData[]>([]);
const confirmRemove = ref<{ type: 'row' | 'topic'; data: RowData | TopicGroup } | null>(null);
const confirmClearWeek = ref<number | null>(null);
const expandedTopics = ref<Set<string>>(new Set());

function toggleTopic(topicId: string) {
  const next = new Set(expandedTopics.value);
  if (next.has(topicId)) {
    next.delete(topicId);
  } else {
    next.add(topicId);
  }
  expandedTopics.value = next;
}

const getTopicName = (topicId: string) => {
  const t = course.value?.topics.find(x => x.id === topicId);
  return t ? t.name : topicId;
};

const getSubtopicName = (topicId: string, subtopicId: string) => {
  const t = course.value?.topics.find(x => x.id === topicId);
  if (!t || !subtopicId) return 'General';
  const s = t.subtopics.find(x => x.id === subtopicId);
  return s ? s.name : subtopicId;
};

const getTopicIsActive = (topicId: string) => {
  const t = course.value?.topics.find(x => x.id === topicId);
  return t ? t.isActive !== false : true;
};

/**
 * Removes a subtopic row and deletes all its distributions.
 * @param row The RowData corresponding to the subtopic row to remove.
 */
const removeRow = async (row: RowData) => {
  if (!syllabus.value?.id) return;
  const dists = store.distributions.filter(d => d.topicId === row.topicId && d.subtopicId === row.subtopicId);
  for (const dist of dists) {
    try {
      await store.deleteDistribution(dist.id, syllabus.value.id);
    } catch (error) {
      console.error(`Error deleting distribution for topic ${row.topicId} subtopic ${row.subtopicId}:`, error);
    }
  }
  localRows.value = localRows.value.filter(r => r.topicId !== row.topicId || r.subtopicId !== row.subtopicId);
};

/**
 * Removes all rows and distributions associated with a topic.
 * @param topicId The unique identifier of the topic.
 */
const removeTopic = async (topicId: string) => {
  if (!syllabus.value?.id) return;
  const rows = matrixRows.value.filter(r => r.topicId === topicId);
  for (const row of rows) {
    await removeRow(row);
  }
};

/**
 * Clears all question allocations/distributions for a specific week.
 * @param weekNumber The week number to clear.
 */
const clearWeek = async (weekNumber: number) => {
  if (!syllabus.value?.id) return;
  const dists = store.distributions.filter(d => d.weekNumber === weekNumber);
  for (const dist of dists) {
    try {
      await store.deleteDistribution(dist.id, syllabus.value.id);
    } catch (error) {
      console.error(`Error clearing distribution in week S${weekNumber} for distribution ${dist.id}:`, error);
    }
  }
};

const onAddSubtopics = (selected: RowData[]) => {
  selected.forEach(row => {
    const exists = localRows.value.some(r => r.topicId === row.topicId && r.subtopicId === row.subtopicId);
    if (!exists) {
      localRows.value.push(row);
    }
  });
};

const matrixRows = computed(() => {
  const map = new Map<string, RowData>();

  store.distributions.forEach(d => {
    const key = `${d.topicId}|${d.subtopicId}`;
    if (!map.has(key)) {
      map.set(key, {
        topicId: d.topicId,
        subtopicId: d.subtopicId,
        topicName: getTopicName(d.topicId),
        subtopicName: getSubtopicName(d.topicId, d.subtopicId),
        topicIsActive: getTopicIsActive(d.topicId)
      });
    }
  });

  localRows.value.forEach(row => {
    const key = `${row.topicId}|${row.subtopicId}`;
    if (!map.has(key)) {
      map.set(key, row);
    }
  });

  let list = Array.from(map.values()).sort((a, b) => a.topicName.localeCompare(b.topicName));

  if (matrixSearchQuery.value) {
    const q = matrixSearchQuery.value.toLowerCase();
    list = list.filter(row =>
      row.topicName.toLowerCase().includes(q) ||
      row.subtopicName.toLowerCase().includes(q)
    );
  }

  return list;
});

const topicGroups = computed<TopicGroup[]>(() => {
  const groups = new Map<string, RowData[]>();
  matrixRows.value.forEach(row => {
    if (!groups.has(row.topicId)) {
      groups.set(row.topicId, []);
    }
    groups.get(row.topicId)!.push(row);
  });

  return Array.from(groups.entries()).map(([topicId, rows]) => {
    const firstRow = rows[0];
    const subtotalByWeek: Record<number, number> = {};
    let subtotal = 0;
    for (const col of matrixColumns.value) {
      const weekDists = store.distributions.filter(d =>
        d.weekNumber === col.number && rows.some(r => r.topicId === d.topicId && r.subtopicId === d.subtopicId)
      );
      const weekTotal = weekDists.reduce((sum, d) => sum + Number(d.questionCount), 0);
      if (weekTotal > 0) subtotalByWeek[col.number] = weekTotal;
      subtotal += weekTotal;
    }
    return {
      topicId,
      topicName: firstRow.topicName,
      topicIsActive: firstRow.topicIsActive,
      rows,
      subtotalByWeek,
      subtotal,
    };
  });
});

const matrixColumns = computed(() => {
  const cols = [];
  const cycleWeeks = cycle.value?.weeks || [];
  for (let w = 1; w <= totalWeeks.value; w++) {
    const cWeek = cycleWeeks.find(cw => cw.weekNumber === w);
    cols.push({
      number: w,
      isActive: cWeek ? cWeek.isActive : true
    });
  }
  return cols;
});

const knownTopicIds = ref<Set<string>>(new Set());

watch(() => topicGroups.value, (groups) => {
  groups.forEach(g => {
    if (!knownTopicIds.value.has(g.topicId)) {
      knownTopicIds.value.add(g.topicId);
      expandedTopics.value.add(g.topicId);
    }
  });
}, { immediate: true });

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `320px repeat(${matrixColumns.value.length}, minmax(80px, 1fr)) 100px`,
  alignItems: 'center'
}));

const getCellValue = (row: RowData, weekNumber: number) => {
  const dist = store.distributions.find(d => d.topicId === row.topicId && d.subtopicId === row.subtopicId && d.weekNumber === weekNumber);
  return dist ? dist.questionCount : '';
};

const getRowTotal = (row: RowData) => {
  const dists = store.distributions.filter(d => d.topicId === row.topicId && d.subtopicId === row.subtopicId);
  return dists.reduce((sum, d) => sum + Number(d.questionCount), 0);
};

const getColTotal = (weekNumber: number) => {
  const dists = store.distributions.filter(d => d.weekNumber === weekNumber);
  return dists.reduce((sum, d) => sum + Number(d.questionCount), 0);
};

const grandTotalQuestionCount = computed(() => store.distributions.reduce((sum, d) => sum + Number(d.questionCount), 0));

const updateCell = async (row: RowData, weekNumber: number, newValueStr: string) => {
  const dist = store.distributions.find(d => d.topicId === row.topicId && d.subtopicId === row.subtopicId && d.weekNumber === weekNumber);
  const newValue = newValueStr.trim() !== '' ? Number(newValueStr) : null;

  const maxLimit = targetQuestionsQuantity.value !== null ? targetQuestionsQuantity.value : 100;
  if (newValue !== null && (newValue < 1 || newValue > maxLimit)) {
    toast.add({
      title: 'Rango Incorrecto',
      description: targetQuestionsQuantity.value !== null
        ? `La cantidad de preguntas debe estar entre 1 y ${targetQuestionsQuantity.value} (límite de la plantilla "${selectedTemplate.value?.name}")`
        : 'La cantidad de preguntas debe estar entre 1 y 100',
      color: 'red'
    });
    return;
  }

  if (dist && dist.questionCount === newValue) return;

  if (isGeneratedWeek(weekNumber)) {
    toast.add({
      title: 'Semana con Materiales Generados',
      description: 'Esta semana ya tiene materiales generados. Al modificar la distribución, los materiales existentes podrían quedar desactualizados.',
      color: 'warning',
      timeout: 5000
    });
  }

  const cellKey = `${row.topicId}|${row.subtopicId}|${weekNumber}`;
  savingCells.value.add(cellKey);

  try {
    if (dist && newValue !== null) {
      await store.updateDistributionQuestionCount(dist.id, syllabus.value.id, newValue);
    } else if (dist && newValue === null) {
      await store.deleteDistribution(dist.id, syllabus.value.id);
    } else if (!dist && newValue !== null) {
      await store.addDistribution(syllabus.value.id, {
        weekNumber,
        topicId: row.topicId,
        subtopicId: row.subtopicId,
        questionCount: newValue,
        templateId: selectedTemplateId.value || undefined
      });
    }
  } catch (e: any) {
    toast.add({ title: 'Error de Guardado', description: e.message || 'No se pudo guardar la cantidad de preguntas', color: 'red' });
  } finally {
    savingCells.value.delete(cellKey);
  }
};

const cellRefs = ref<Map<string, HTMLInputElement>>(new Map());

const focusNextCell = (currentRow: RowData, currentWeek: number, direction: 'right' | 'left' | 'down' | 'up') => {
  const rows = matrixRows.value;
  const cols = matrixColumns.value;
  const rowIdx = rows.findIndex(r => r.topicId === currentRow.topicId && r.subtopicId === currentRow.subtopicId);
  const colIdx = cols.findIndex(c => c.number === currentWeek);

  let nextRow: number;
  let nextCol: number;

  switch (direction) {
    case 'right':
      nextRow = rowIdx;
      nextCol = Math.min(colIdx + 1, cols.length - 1);
      break;
    case 'left':
      nextRow = rowIdx;
      nextCol = Math.max(colIdx - 1, 0);
      break;
    case 'down':
      nextRow = Math.min(rowIdx + 1, rows.length - 1);
      nextCol = colIdx;
      break;
    case 'up':
      nextRow = Math.max(rowIdx - 1, 0);
      nextCol = colIdx;
      break;
  }

  if (nextRow !== rowIdx || nextCol !== colIdx) {
    focusCell(rows[nextRow], cols[nextCol].number);
  }
};

const focusCell = (row: RowData, weekNumber: number) => {
  const key = `${row.topicId}|${row.subtopicId}|${weekNumber}`;
  nextTick(() => {
    const input = cellRefs.value.get(key);
    if (input) {
      input.focus();
      input.select();
    }
  });
};

const handleCellKeydown = (e: KeyboardEvent, row: RowData, weekNumber: number) => {
  const target = e.target as HTMLInputElement;
  if (e.key === 'Enter') {
    e.preventDefault();
    target.blur();
    focusNextCell(row, weekNumber, 'down');
  } else if (e.key === 'Tab') {
    e.preventDefault();
    target.blur();
    if (e.shiftKey) {
      focusNextCell(row, weekNumber, 'left');
    } else {
      focusNextCell(row, weekNumber, 'right');
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    target.blur();
    focusNextCell(row, weekNumber, 'up');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    target.blur();
    focusNextCell(row, weekNumber, 'down');
  } else if (e.key === 'ArrowRight') {
    if (target.selectionStart === target.value.length) {
      e.preventDefault();
      target.blur();
      focusNextCell(row, weekNumber, 'right');
    }
  } else if (e.key === 'ArrowLeft') {
    if (target.selectionStart === 0) {
      e.preventDefault();
      target.blur();
      focusNextCell(row, weekNumber, 'left');
    }
  }
};

const progressPercentage = (weekNumber: number) => {
  if (!targetQuestionsQuantity.value) return 0;
  const total = getColTotal(weekNumber);
  if (total === 0) return 0;
  return Math.min(100, Math.round((total / targetQuestionsQuantity.value) * 100));
};

const weekStatus = (weekNumber: number) => {
  if (!targetQuestionsQuantity.value) return 'none';
  const total = getColTotal(weekNumber);
  if (total === 0) return 'empty';
  if (total === targetQuestionsQuantity.value) return 'exact';
  if (total > targetQuestionsQuantity.value) return 'over';
  return 'under';
};

const formatWeekStatus = (weekNumber: number) => {
  const status = weekStatus(weekNumber);
  const total = getColTotal(weekNumber);
  const target = targetQuestionsQuantity.value;
  switch (status) {
    case 'empty': return 'Sin asignar';
    case 'exact': return `${total} / ${target} — Completo`;
    case 'over': return `${total} / ${target} — Excede límite`;
    case 'under': return `${total} / ${target} — Parcial`;
    default: return `${total || 0} preguntas`;
  }
};
</script>

<template>
  <div class="space-y-6 w-full pb-10">
    <div
      class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white dark:bg-[#1e1e2d] px-6 py-5 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm gap-4">
      <div class="flex items-center gap-3">
        <div
          class="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-950/50 dark:to-indigo-900/30 border border-indigo-200/50 dark:border-indigo-800/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shadow-sm shrink-0">
          <UIcon name="i-heroicons-table-cells" class="w-5.5 h-5.5" />
        </div>
        <div class="space-y-0.5">
          <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            Matriz de Distribución
          </h3>
          <p class="text-xs text-slate-400 dark:text-slate-500 font-medium">
            Curso: <span class="text-slate-700 dark:text-slate-300 font-bold">{{ course?.name }}</span>
            <span class="mx-1.5 text-slate-300 dark:text-slate-600">•</span>
            {{ totalWeeks }} semanas
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
        <div v-if="targetQuestionsQuantity !== null"
          class="bg-gradient-to-br from-indigo-50/80 to-indigo-100/40 dark:from-indigo-950/40 dark:to-indigo-900/20 px-4 py-2 rounded-xl border border-indigo-200/40 dark:border-indigo-800/30 text-right shadow-inner">
          <p class="text-[9px] uppercase tracking-wider text-indigo-500 dark:text-indigo-500 font-bold mb-0.5">Preguntas
            Asignadas</p>
          <p class="text-2xl font-black text-indigo-700 dark:text-indigo-400 leading-none transition-all duration-300">
            {{ grandTotalQuestionCount }}
            <span class="text-xs font-semibold text-indigo-400 dark:text-indigo-500 ml-1">
              / {{ targetQuestionsQuantity * totalWeeks }}
            </span>
          </p>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-plus" class="btn-premium-primary"
          @click="slideOverRef?.open()">
          Añadir Temas
        </UButton>
      </div>
    </div>

    <div
      class="border border-slate-200/80 dark:border-slate-800/80 rounded-2xl bg-slate-50/50 dark:bg-[#15152a] shadow-sm overflow-hidden flex flex-col relative px-5">

      <div class="px-4 py-3 bg-slate-50/60 dark:bg-[#15152a]/40 flex items-center justify-between gap-4">
        <div class="flex flex-1 items-center gap-4 flex-wrap">
          <div class="w-full max-w-xs relative">
            <UInput v-model="matrixSearchQuery" placeholder="Filtrar por tema o subtema..." icon="i-heroicons-funnel"
              size="sm" color="gray" variant="outline" class="w-full" />
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span
              class="text-[11px] font-semibold text-slate-400 dark:text-slate-550 uppercase tracking-wider">Plantilla:</span>
            <USelectMenu v-model="selectedTemplateId" :items="templates" value-key="id" label-key="name"
              placeholder="Selecciona plantilla..." class="w-44" size="sm">
              <template #empty>
                <div class="text-xs text-slate-500 text-center py-2">
                  No hay plantillas en este ciclo
                </div>
              </template>
            </USelectMenu>
          </div>

          <div v-if="targetQuestionsQuantity !== null"
            class="bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/30 dark:border-indigo-800/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 shrink-0">
            <UIcon name="i-heroicons-flag" class="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400" />
            <span class="text-xs font-semibold text-indigo-700 dark:text-indigo-400">
              Meta: {{ targetQuestionsQuantity }} preg/semana
            </span>
          </div>
        </div>
        <span class="text-xs text-slate-400 dark:text-slate-500 font-medium select-none shrink-0">
          {{ matrixRows.length }} {{ matrixRows.length === 1 ? 'fila' : 'filas' }}
        </span>
      </div>

      <div class="overflow-x-auto custom-scrollbar">
        <div v-if="matrixRows.length === 0" class="py-20 text-center text-slate-400 dark:text-slate-500">
          <div class="max-w-xs mx-auto space-y-3">
            <div
              class="w-14 h-14 mx-auto rounded-xl bg-slate-100 dark:bg-slate-800/40 flex items-center justify-center">
              <UIcon name="i-heroicons-document-plus" class="w-7 h-7 text-slate-300 dark:text-slate-600" />
            </div>
            <div>
              <p class="font-semibold text-sm text-slate-600 dark:text-slate-300">Distribución vacía</p>
              <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Agrega subtemas usando el botón "Añadir Temas".
              </p>
            </div>
          </div>
        </div>

        <div v-else class="matrix-scroll">
          <!-- Header -->
          <div class="matrix-row header sticky top-0 z-30" :style="gridStyle">
            <div
              class="name-col sticky left-0 z-[31] bg-white dark:bg-[#1e1e2d] px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 text-slate-400 dark:text-slate-500 text-[10px] font-semibold uppercase tracking-wider rounded-tl-2xl">
              Tema / Subtema
            </div>
            <div v-for="col in matrixColumns" :key="col.number"
              class="week-col px-2 py-3 border-b border-slate-200 dark:border-slate-800/80 text-center text-[10px] font-semibold bg-white dark:bg-[#1e1e2d]"
              :class="col.isActive ? 'text-slate-400 dark:text-slate-500' : 'text-slate-300 dark:text-slate-600'">
              <div class="flex items-center justify-center gap-1">
                <span class="font-bold text-[11px]"
                  :class="isGeneratedWeek(col.number) ? 'text-amber-600 dark:text-amber-400' : ''">
                  S{{ col.number }}
                </span>
                <div v-if="isGeneratedWeek(col.number)" class="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"
                  title="Materiales generados en esta semana" />
                <div v-if="!col.isActive" class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"
                  title="Semana inactiva" />
              </div>
            </div>
            <div
              class="total-col px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-white dark:bg-[#1e1e2d] rounded-tr-2xl">
              Total
            </div>
          </div>

          <!-- Topic Sections -->
          <div v-for="group in topicGroups" :key="group.topicId" class="topic-section">
            <div class="topic-card" :class="{ 'is-collapsed': !expandedTopics.has(group.topicId) }">
              <!-- Topic Header Row -->
              <div class="topic-header" :style="gridStyle" @click="toggleTopic(group.topicId)">
                <div class="name-col sticky z-10 bg-white dark:bg-[#1e1e2d] px-4 py-3 ">
                  <div class="flex items-center gap-2">
                    <div class="topic-accent" />
                    <span class="font-bold text-xs text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{{
                      group.topicName }}</span>
                    <UBadge v-if="!group.topicIsActive" color="red" variant="subtle" size="xs">Inactivo</UBadge>
                    <button @click.stop="confirmRemove = { type: 'topic', data: group }"
                      class="w-5 h-5 flex items-center justify-center rounded text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all shrink-0"
                      title="Quitar todo el tema">
                      <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
                    </button>
                    <UIcon
                      :name="expandedTopics.has(group.topicId) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                      class="ml-auto w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200 shrink-0"
                      :class="expandedTopics.has(group.topicId) ? 'rotate-0' : '-rotate-90'" />
                  </div>
                </div>
                <div v-for="col in matrixColumns" :key="col.number" class="week-col px-1 py-1 text-center">
                  <div v-if="group.subtotalByWeek[col.number]"
                    class="inline-flex items-center justify-center min-w-[20px] h-4 rounded text-[9px] font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/20">
                    {{ group.subtotalByWeek[col.number] }}
                  </div>
                </div>
                <div class="total-col px-3 py-1 text-center font-bold text-[11px] text-indigo-600 dark:text-indigo-400">
                  {{ group.subtotal || '-' }}
                </div>
              </div>

              <!-- Subtopic Rows inside card -->
              <template v-if="expandedTopics.has(group.topicId)">
                <div class="topic-divider" />
                <div v-for="row in group.rows" :key="row.topicId + '|' + row.subtopicId" class="subtopic-row group"
                  :style="gridStyle">
                  <div
                    class="name-col sticky z-10 bg-white dark:bg-[#1e1e2d] group-hover:bg-slate-50/60 dark:group-hover:bg-slate-800/10 px-4 pl-9 py-2.5 transition-colors">
                    <div class="flex items-center gap-2">
                      <span class="text-xs text-slate-700 dark:text-slate-300 line-clamp-1" :title="row.subtopicName">
                        {{ row.subtopicName }}
                      </span>
                      <UBadge v-if="!row.topicIsActive" color="red" variant="subtle" size="xs">Inactivo</UBadge>
                      <button @click.stop="confirmRemove = { type: 'row', data: row }"
                        class="w-4 h-4 flex items-center justify-center rounded text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all shrink-0"
                        title="Quitar subtema">
                        <UIcon name="i-heroicons-x-mark" class="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  <div v-for="col in matrixColumns" :key="col.number" class="week-col p-0.5 text-center relative"
                    :class="{ 'opacity-30': !col.isActive }">
                    <template v-if="col.isActive">
                      <div class="relative w-full h-8 flex items-center justify-center">
                        <input type="number" min="1"
                          :ref="el => { if (el) cellRefs.set(`${row.topicId}|${row.subtopicId}|${col.number}`, el as HTMLInputElement) }"
                          :max="targetQuestionsQuantity !== null ? targetQuestionsQuantity : 100"
                          class="w-full h-full text-center border border-transparent rounded-lg text-xs font-semibold bg-transparent dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/30 hover:border-slate-200/80 dark:hover:border-slate-700 focus:bg-white dark:focus:bg-slate-800 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 pl-3.5 transition-all"
                          :class="{
                            'text-slate-300 dark:text-slate-500': getCellValue(row, col.number) === '',
                            'text-emerald-600 dark:text-emerald-400': getCellValue(row, col.number) !== '' && targetQuestionsQuantity !== null && Number(getCellValue(row, col.number)) === targetQuestionsQuantity,
                            'text-amber-600 dark:text-amber-400': getCellValue(row, col.number) !== '' && targetQuestionsQuantity !== null && Number(getCellValue(row, col.number)) < targetQuestionsQuantity,
                          }" :value="getCellValue(row, col.number)"
                          @blur="e => updateCell(row, col.number, (e.target as HTMLInputElement).value)"
                          @keydown="e => handleCellKeydown(e, row, col.number)" placeholder="-" />

                        <div v-if="savingCells.has(`${row.topicId}|${row.subtopicId}|${col.number}`)"
                           class="absolute inset-0 flex items-center justify-center bg-white/70 dark:bg-slate-900/70 rounded-lg">
                           <UIcon name="i-heroicons-arrow-path" class="w-3 h-3 text-indigo-400 animate-spin" />
                        </div>
                      </div>
                    </template>
                    <div v-else class="flex items-center justify-center text-slate-300 dark:text-slate-600 h-8">
                      <UIcon name="i-heroicons-lock-closed" class="w-2.5 h-2.5" />
                    </div>
                  </div>

                  <div class="total-col px-3 py-2.5 text-center font-bold text-xs text-slate-600 dark:text-slate-400">
                    {{ getRowTotal(row) || '-' }}
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Footer -->
          <div class="footer-card">
            <div class="matrix-row footer" :style="gridStyle">
              <div
                class="name-col sticky z-10 bg-white dark:bg-[#1e1e2d] px-4 py-3 font-bold text-right text-[11px] text-slate-550 dark:text-slate-400">
                Totales
              </div>
              <div v-for="col in matrixColumns" :key="col.number"
                class="week-col px-2 py-3 dark:border-slate-800/80 text-center"
                :class="{ 'text-slate-400 dark:text-slate-500': !col.isActive }">
                <div v-if="col.isActive" class="flex flex-col items-center gap-1.5">
                  <div class="flex items-center gap-1.5">
                    <span class="font-bold text-xs" :class="{
                      'text-emerald-600 dark:text-emerald-400': targetQuestionsQuantity !== null && weekStatus(col.number) === 'exact',
                      'text-rose-500 dark:text-rose-400': targetQuestionsQuantity !== null && weekStatus(col.number) === 'over',
                      'text-amber-600 dark:text-amber-400': targetQuestionsQuantity !== null && weekStatus(col.number) === 'under',
                      'text-indigo-600 dark:text-indigo-400': targetQuestionsQuantity === null,
                    }">{{ getColTotal(col.number) || '-' }}</span>
                  </div>
                  <div v-if="targetQuestionsQuantity !== null && getColTotal(col.number) > 0"
                    class="w-10 h-1 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700/60">
                    <div class="h-full rounded-full transition-all duration-500" :class="{
                      'bg-emerald-500': weekStatus(col.number) === 'exact',
                      'bg-rose-400': weekStatus(col.number) === 'over',
                      'bg-amber-400': weekStatus(col.number) === 'under',
                      'bg-indigo-400': weekStatus(col.number) === 'none',
                    }" :style="{ width: Math.min(100, progressPercentage(col.number)) + '%' }" />
                  </div>
                </div>
                <span v-else class="font-bold text-xs">{{ getColTotal(col.number) || '-' }}</span>
              </div>
              <div
                class="total-col bg-indigo-50/50 dark:bg-indigo-950/30 px-4 py-3 text-center font-black text-sm text-indigo-700 dark:text-indigo-400">
                {{ grandTotalQuestionCount }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <SyllabusSubtopicSlideOver ref="slideOverRef" :courseId="syllabus?.courseId"
      :existingKeys="matrixRows.map(r => `${r.topicId}|${r.subtopicId}`)" @add-subtopics="onAddSubtopics" />

    <Transition name="backdrop-fade">
      <div v-if="confirmRemove || confirmClearWeek" class="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40"
        @click="confirmRemove = null; confirmClearWeek = null" />
    </Transition>

    <Transition name="confirm-scale">
      <div v-if="confirmRemove || confirmClearWeek"
        class="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <div
          class="bg-white dark:bg-[#1e1e2d] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 max-w-sm w-full mx-4 pointer-events-auto">
          <div class="flex items-center gap-3 mb-4">
            <div
              class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex items-center justify-center text-rose-500 shrink-0">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="font-bold text-sm text-slate-800 dark:text-slate-200">
                <template v-if="confirmClearWeek">¿Limpiar semana S{{ confirmClearWeek }}?</template>
                <template v-else-if="confirmRemove?.type === 'topic'">¿Quitar todo el tema?</template>
                <template v-else>¿Quitar subtema?</template>
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <template v-if="confirmClearWeek">
                  Se eliminarán todas las distribuciones de la semana <strong>S{{ confirmClearWeek }}</strong> ({{
                    getColTotal(confirmClearWeek) }} preguntas).
                </template>
                <template v-else-if="confirmRemove?.type === 'topic'">
                  Se eliminarán todos los subtemas y sus distribuciones de <strong>{{ (confirmRemove?.data as
                    TopicGroup).topicName }}</strong>.
                </template>
                <template v-else>
                  Se eliminarán todas las distribuciones de <strong>{{ (confirmRemove?.data as RowData).subtopicName
                    }}</strong>.
                </template>
              </p>
            </div>
          </div>
          <div class="flex justify-end gap-3">
            <UButton color="neutral" variant="soft" size="sm" @click="confirmRemove = null; confirmClearWeek = null">
              Cancelar</UButton>
            <UButton color="red" size="sm" @click="() => {
              if (confirmClearWeek) {
                clearWeek(confirmClearWeek);
                confirmClearWeek = null;
              } else if (confirmRemove?.type === 'topic') {
                removeTopic((confirmRemove.data as TopicGroup).topicId);
                confirmRemove = null;
              } else if (confirmRemove?.type === 'row') {
                removeRow(confirmRemove.data as RowData);
                confirmRemove = null;
              }
            }">
              <template v-if="confirmClearWeek">Limpiar</template>
              <template v-else>Quitar</template>
            </UButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.matrix-scroll {
  min-width: 100%;
  width: max-content;
  padding-bottom: 20px;
}

/* Row grid layout */
.matrix-row {
  display: grid;
  align-items: center;
}

.topic-section {
  margin: 12px 0;
}

/* Topic card - outer container */
.topic-card {
  background-color: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px 0 rgb(0 0 0 / 0.08);
  transition: box-shadow 0.2s ease;
}

.topic-card:hover {
  box-shadow: 0 8px 28px 0 rgb(0 0 0 / 0.14);
}

html.dark .topic-card {
  background-color: rgb(30 41 59 / 0.4);
  box-shadow: 0 4px 16px 0 rgb(0 0 0 / 0.3);
}

html.dark .topic-card:hover {
  box-shadow: 0 8px 28px 0 rgb(0 0 0 / 0.4);
}

.topic-card.is-collapsed {
  margin-bottom: 0;
}

/* Topic header - clickable grid row */
.topic-header {
  display: grid;
  align-items: center;
  cursor: pointer;
  user-select: none;
  border-radius: 16px 16px 0 0;
}

/* Footer card */
.footer-card {
  margin-top: 16px;
  background-color: #fff;
  border-radius: 16px;
  box-shadow: 0 4px 16px 0 rgb(0 0 0 / 0.08);
  transition: box-shadow 0.2s ease;
}

html.dark .footer-card {
  background-color: rgb(30 41 59 / 0.4);
  box-shadow: 0 4px 16px 0 rgb(0 0 0 / 0.3);
}

html.dark .topic-header {
  border-radius: 16px 16px 0 0;
}

/* Subtopic rows - list inside card */
.subtopic-row {
  display: grid;
  align-items: center;
  border-bottom: 1px solid rgb(241 245 249);
}

html.dark .subtopic-row {
  border-bottom-color: rgb(51 65 85 / 0.25);
}

.subtopic-row:last-child {
  border-bottom: none;
  border-radius: 0 0 16px 16px;
}

.subtopic-row:hover {
  background-color: rgb(248 250 252 / 0.8);
}

html.dark .subtopic-row:hover {
  background-color: rgb(30 41 59 / 0.15);
}

/* Divider between topic header and subtopics */
.topic-divider {
  height: 1px;
  background: linear-gradient(to right, transparent, rgb(226 232 240), transparent);
}

html.dark .topic-divider {
  background: linear-gradient(to right, transparent, rgb(51 65 85 / 0.4), transparent);
}

/* Header row */
.matrix-row.header {
  position: sticky;
  top: 0;
  z-index: 30;
}

/* Name column - sticky left */
.name-col {
  position: sticky;
  left: 0;
  z-index: 10;
}

.name-col.sticky {
  position: sticky;
  left: 0;
}

.matrix-row.header .name-col {
  z-index: 31;
}

/* Rounded corners for sticky column matching card boundaries */
.topic-header .name-col {
  border-top-left-radius: 16px;
}

.subtopic-row:last-child .name-col {
  border-bottom-left-radius: 16px;
}

.topic-card.is-collapsed .topic-header .name-col {
  border-radius: 16px 0 0 16px;
}

.footer-card .name-col {
  border-radius: 16px 0 0 16px;
}

/* Topic accent bar */
.topic-accent {
  width: 3px;
  height: 18px;
  border-radius: 2px;
  background: linear-gradient(to bottom, #818cf8, #6366f1);
  flex-shrink: 0;
}

html.dark .topic-accent {
  background: linear-gradient(to bottom, #818cf8, rgba(129, 140, 248, 0.7));
}

/* Week and total columns */
.week-col {
  text-align: center;
}

.total-col {
  text-align: center;
}



.custom-scrollbar::-webkit-scrollbar {
  height: 6px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
  border: 2px solid transparent;
  background-clip: padding-box;
}

:deep(.dark) .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569;
}

.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 200ms ease;
}

.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}



.confirm-scale-enter-active {
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.confirm-scale-leave-active {
  transition: all 150ms ease;
}

.confirm-scale-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(8px);
}

.confirm-scale-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
