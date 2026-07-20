<script setup lang="ts">
import { ref, watch } from 'vue';
import { useSyllabusStore } from '../store';
import { useAcademicTimeStore } from '@/features/academic-time/store';
import { useCatalogsStore } from '@/features/catalogs/store';
import { useApi } from '@/composables/useApi';
import { useToast } from '#imports';

const store = useSyllabusStore();
const timeStore = useAcademicTimeStore();
const catalogsStore = useCatalogsStore();
const api = useApi();
const toast = useToast();

const isOpen = ref(false);
const sourceId = ref('');
const selectedCycleId = ref('');
const courseId = ref(''); // Pass this from parent

// Load cycles when modal opens
watch(isOpen, async (val) => {
  if (val && timeStore.cycles.length === 0) {
    await timeStore.fetchCycles();
  }
  if (val) {
    selectedCycleId.value = '';
    sourceId.value = '';
    availableSyllabuses.value = [];
  }
});

// Load syllabuses when a cycle is selected
const availableSyllabuses = ref<any[]>([]);
const loadingSyllabuses = ref(false);

watch(selectedCycleId, async (val) => {
  if (!val) {
    availableSyllabuses.value = [];
    sourceId.value = '';
    return;
  }
  loadingSyllabuses.value = true;
  try {
    const res = await api(`/api/v1/syllabus/cycle/${val}`);
    availableSyllabuses.value = res as any[];
    
    // Auto-select syllabus for the same course if it exists
    if (courseId.value) {
      const match = availableSyllabuses.value.find(s => s.courseId === courseId.value);
      if (match) sourceId.value = match.id;
    }
  } catch (e) {
    console.error(e);
  } finally {
    loadingSyllabuses.value = false;
  }
});

const getCourseName = (cId: string) => {
  const course = catalogsStore.courses.find(c => c.id === cId);
  return course ? course.name : 'Curso desconocido';
};

const syllabusOptions = computed(() => {
  return availableSyllabuses.value.map(s => ({
    id: s.id,
    label: `${getCourseName(s.courseId)} - ${s.name}`
  }));
});

const confirmClone = async () => {
  if (!sourceId.value) return;
  // If no target is set in store.syllabus, it means they are doing this from outside?
  // Actually, we pass targetId if possible
  const targetId = store.syllabus?.id;
  if (!targetId) {
    toast.add({
      title: 'Error al Clonar',
      description: 'No hay un sílabo destino configurado.',
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    });
    return;
  }
  try {
    await store.cloneSyllabus(targetId, sourceId.value);
    toast.add({
      title: 'Clonación Exitosa',
      description: 'El sílabo ha sido clonado correctamente.',
      color: 'success',
      icon: 'i-heroicons-check-circle'
    });
    isOpen.value = false;
  } catch (err: any) {
    toast.add({
      title: 'Error',
      description: err.message,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    });
  }
};

defineExpose({ isOpen, courseId });
</script>

<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <!-- Nuxt UI v3's UCard folds v2's separate `ring`/`divide` :ui keys into
           `root`'s class string -- this is that same visual treatment
           (no ring, divider between header/body/footer), not an arbitrary
           class list. -->
      <UCard :ui="{ root: 'ring-0 divide-y divide-slate-100 dark:divide-slate-800' }">
        <div class="p-4 sm:p-6">
          <h3 class="text-lg font-medium mb-4">Clonar Sílabo Individual</h3>
          <UAlert 
            v-if="store.distributions.length > 0"
            color="warning" 
            variant="subtle" 
            icon="i-heroicons-exclamation-triangle" 
            title="Existen datos previos" 
            description="Esta acción sobrescribirá las distribuciones actuales del sílabo." 
            class="mb-4"
          />
          
          <UFormField label="1. Seleccionar Ciclo Origen" class="mb-4">
            <USelect 
              v-model="selectedCycleId" 
              :items="timeStore.cycles" 
              value-key="id" 
              label-key="name" 
              placeholder="Selecciona un ciclo..." 
              class="w-full"
            />
          </UFormField>
          
          <UFormField label="2. Seleccionar Sílabo a Clonar" class="mb-4">
            <USelect 
              v-model="sourceId" 
              :items="syllabusOptions" 
              value-key="id" 
              label-key="label"
              placeholder="Selecciona el sílabo..." 
              :loading="loadingSyllabuses"
              :disabled="!selectedCycleId"
              class="w-full"
            />
          </UFormField>
          
          <div class="flex justify-end gap-2 mt-6">
            <UButton color="neutral" variant="ghost" class="btn-premium-secondary" @click="() => { isOpen = false }">Cancelar</UButton>
            <UButton color="neutral" variant="ghost" class="btn-premium-primary" @click="confirmClone" :loading="store.loading" :disabled="!sourceId">Confirmar Clonación</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
