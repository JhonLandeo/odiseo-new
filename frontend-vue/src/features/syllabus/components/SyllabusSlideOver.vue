<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useSyllabusStore } from '../store';
import { useAcademicTimeStore } from '../../academic-time/store';
import { useCatalogsStore } from '../../catalogs/store';

const store = useSyllabusStore();
const timeStore = useAcademicTimeStore();
const catalogsStore = useCatalogsStore();

const isOpen = ref(false);

const form = ref({
  cycleId: '',
  courseId: ''
});

const availableCourses = computed(() => {
  const existingCourseIds = new Set(store.syllabiList.map(s => s.courseId));
  return catalogsStore.courses.filter(c => !existingCourseIds.has(c.id));
});

onMounted(async () => {
  if (timeStore.cycles.length === 0) {
    await timeStore.fetchCycles();
  }
  if (catalogsStore.courses.length === 0) {
    await catalogsStore.fetchCourses();
  }
});

const submit = async () => {
  if (!form.value.cycleId || !form.value.courseId) return;
  
  await store.createSyllabus({ cycleId: form.value.cycleId, courseId: form.value.courseId });
  if (!store.error) {
    isOpen.value = false;
    form.value.cycleId = '';
    form.value.courseId = '';
  }
};

const close = () => {
  isOpen.value = false;
};

defineExpose({ isOpen, form });
</script>

<template>
  <Transition name="backdrop-fade">
    <div v-if="isOpen" class="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40" @click="close" />
  </Transition>

  <Transition name="slideover">
    <div v-if="isOpen" class="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[#1e1e2d] border-l border-slate-100 dark:border-slate-800 shadow-2xl z-50 flex flex-col">
      <div class="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        <div>
          <h2 class="text-xl font-bold text-slate-900 dark:text-white">Crear Sílabo</h2>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Configura un nuevo sílabo vinculando un curso a un ciclo.</p>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="close" />
      </div>
      
      <div class="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        <div>
          <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Ciclo Académico *</label>
          <USelectMenu 
            v-model="form.cycleId" 
            :items="timeStore.cycles" 
            value-key="id" 
            label-key="name" 
            placeholder="Selecciona un ciclo" 
            class="w-full"
          />
        </div>

        <div>
          <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Curso *</label>
          <USelectMenu 
            v-model="form.courseId" 
            :items="availableCourses" 
            value-key="id" 
            label-key="name" 
            placeholder="Selecciona un curso" 
            class="w-full"
          >
            <template #empty>
              <div class="text-sm text-slate-500 text-center py-4">
                Todos los cursos ya fueron agregados o no hay cursos disponibles.
              </div>
            </template>
          </USelectMenu>
        </div>

        <div class="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
          <p class="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
            <strong>Nota:</strong> Una vez creado, podrás configurar la matriz de distribución de preguntas por semana para este sílabo.
          </p>
        </div>

        <UAlert v-if="store.error" color="error" variant="subtle" icon="i-heroicons-exclamation-triangle" :title="store.error" />
      </div>

      <div class="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#1e1e2d] flex justify-end gap-3 shrink-0">
        <UButton color="neutral" variant="soft" @click="close">Cancelar</UButton>
        <UButton color="primary" :loading="store.loading" :disabled="!form.cycleId || !form.courseId" @click="submit">Confirmar y Crear</UButton>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 200ms ease;
}
.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

.slideover-enter-active,
.slideover-leave-active {
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
}
.slideover-enter-from,
.slideover-leave-to {
  transform: translateX(100%);
}
</style>
