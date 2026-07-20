<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSyllabusStore } from '../store';
import { useAcademicTimeStore } from '@/features/academic-time/store';
import { useToast } from '#imports';

const store = useSyllabusStore();
const timeStore = useAcademicTimeStore();

const isOpen = ref(false);
const sourceCycleId = ref('');
const targetCycleId = ref('');
const hasConfirmedOverwrite = ref(false);

const toast = useToast();

const availableSourceCycles = computed(() => {
  console.log('[CycleCloneModal] Computing available source cycles. Total cycles in store:', timeStore.cycles.length, 'Target cycle:', targetCycleId.value);
  const filtered = timeStore.cycles.filter(c => c.id !== targetCycleId.value);
  console.log('[CycleCloneModal] Filtered available source cycles count:', filtered.length, filtered);
  return filtered;
});

const isConfirmDisabled = computed(() => {
  if (!sourceCycleId.value) return true;
  if (store.syllabiList.length > 0 && !hasConfirmedOverwrite.value) return true;
  return false;
});

watch(isOpen, async (val) => {
  console.log('[CycleCloneModal] isOpen watcher triggered with val:', val, 'current cycles in store:', timeStore.cycles.length);
  if (val) {
    sourceCycleId.value = '';
    hasConfirmedOverwrite.value = false;
    if (timeStore.cycles.length === 0) {
      try {
        await timeStore.fetchCycles();
      } catch (e) {
        console.error('Error fetching cycles in CycleCloneModal:', e);
      }
    }
  }
});

const open = (targetId: string) => {
  console.log('[CycleCloneModal] open() called with targetId:', targetId);
  targetCycleId.value = targetId;
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const confirmClone = async () => {
  if (isConfirmDisabled.value || !targetCycleId.value) return;
  try {
    const res = await store.cloneCycleSyllabuses(targetCycleId.value, sourceCycleId.value);
    toast.add({
      title: 'Clonación Exitosa',
      description: `Se han clonado ${res.clonedCount} sílabos correctamente.`,
      color: 'success',
      icon: 'i-heroicons-check-circle'
    });
    isOpen.value = false;
  } catch (err: any) {
    toast.add({
      title: 'Error al Clonar',
      description: err.message,
      color: 'error',
      icon: 'i-heroicons-exclamation-circle'
    });
  }
};

defineExpose({ open });
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
          <h3 class="text-lg font-medium mb-4">Clonar Sílabos del Ciclo</h3>
          <p class="text-sm text-slate-500 dark:text-slate-400 mb-6">
            Esta acción copiará todos los sílabos configurados de un ciclo anterior hacia el ciclo actual. Si ya existe un sílabo para un curso, este será sobrescrito.
          </p>

          <UAlert 
            v-if="store.syllabiList.length > 0"
            color="warning" 
            variant="subtle" 
            icon="i-heroicons-exclamation-triangle" 
            title="Existen sílabos configurados" 
            description="Este ciclo ya tiene sílabos o planificaciones registradas. Al proceder con la clonación, se sobrescribirá cualquier contenido existente en los cursos correspondientes." 
            class="mb-6"
          />
          
          <UFormField label="Seleccionar Ciclo Origen" class="mb-4">
            <USelect 
              v-model="sourceCycleId" 
              :items="availableSourceCycles" 
              value-key="id" 
              label-key="name" 
              placeholder="Selecciona el ciclo desde el cual copiar..." 
              class="w-full"
            />
          </UFormField>

          <div v-if="store.syllabiList.length > 0" class="mb-4">
            <UCheckbox
              v-model="hasConfirmedOverwrite"
              label="Entiendo que se sobrescribirán los datos y sílabos existentes en el ciclo destino"
            />
          </div>
          
          <div class="flex justify-end gap-2 mt-6">
            <UButton color="neutral" variant="ghost" class="btn-premium-secondary" @click="close">Cancelar</UButton>
            <UButton color="neutral" variant="ghost" class="btn-premium-primary" @click="confirmClone" :loading="store.loading" :disabled="isConfirmDisabled">Confirmar Clonación</UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>
