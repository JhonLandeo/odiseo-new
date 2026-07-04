<script setup lang="ts">
import { ref, watch } from 'vue'
import { usePdfDesignsStore, type PdfDesignTemplate } from '../store/pdfDesigns'
import PdfDesignPreview from './PdfDesignPreview.vue'

const props = defineProps<{
  modelValue: string | null
  courseName?: string
  weekNumber?: number
  templateName?: string
  cycleName?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const store = usePdfDesignsStore()
const selectedId = ref<string | null>(props.modelValue)
const previewHtml = ref('')
const showPreview = ref(false)
const loadingPreview = ref(false)

watch(() => props.modelValue, (val) => {
  selectedId.value = val
})

watch(selectedId, (val) => {
  emit('update:modelValue', val)
})

async function openPreview() {
  if (!selectedId.value) return
  loadingPreview.value = true
  showPreview.value = true
  try {
    const contextBody = {
      courseName: props.courseName,
      weekNumber: props.weekNumber,
      templateName: props.templateName,
      cycleName: props.cycleName
    }
    previewHtml.value = await store.fetchPreview(selectedId.value, contextBody)
  } catch {
    previewHtml.value = '<p class="p-4 text-rose-500">Error al cargar preview</p>'
  } finally {
    loadingPreview.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <label class="block text-[10px] font-black text-indigo-500 uppercase tracking-widest">
      Plantilla de Diseño
    </label>
    <div class="flex gap-2">
      <USelectMenu v-model="selectedId" :items="store.designs" value-key="id" label-key="name"
        placeholder="Sin personalización" class="flex-1" size="sm">
        <template #default>
          {{ store.designs.find(d => d.id === selectedId)?.name || 'Sin personalización' }}
        </template>
        <template #option="{ option }">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full" :style="{ background: 'rgb(' + (option.primaryTitleColor || '2, 113, 184') + ')' }" />
            <span>{{ option.name }}</span>
            <span v-if="option.cycleCount" class="text-[9px] text-slate-400 dark:text-slate-500">({{ option.cycleCount }} {{ option.cycleCount === 1 ? 'ciclo' : 'ciclos' }})</span>
            <UBadge v-if="option.isDefault" size="xs" color="indigo" variant="solid">Default</UBadge>
          </div>
        </template>
      </USelectMenu>
      <UButton v-if="selectedId" color="gray" variant="ghost" icon="i-heroicons-eye"
        @click="openPreview" :disabled="loadingPreview" size="sm" />
    </div>

    <Teleport to="body">
      <Transition name="modal-backdrop">
        <div v-if="showPreview" class="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          @click="showPreview = false" />
      </Transition>
      <Transition name="modal-card">
        <div v-if="showPreview"
          class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div class="bg-white dark:bg-[#1a1a24] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col pointer-events-auto">
            <div class="flex items-center justify-between px-6 pt-4 pb-2">
              <h3 class="text-sm font-bold text-slate-800 dark:text-slate-200">Vista Previa (Diseño Seleccionado)</h3>
              <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showPreview = false" />
            </div>
            <div class="overflow-y-auto flex-1 px-6 pb-6">
              <PdfDesignPreview :html="previewHtml" :loading="loadingPreview" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.modal-backdrop-enter-active,
.modal-backdrop-leave-active {
  transition: opacity 200ms ease;
}
.modal-backdrop-enter-from,
.modal-backdrop-leave-to {
  opacity: 0;
}
.modal-card-enter-active {
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
}
.modal-card-leave-active {
  transition: all 200ms ease-in;
}
.modal-card-enter-from {
  opacity: 0;
  transform: scale(0.95) translateY(8px);
}
.modal-card-leave-to {
  opacity: 0;
}
</style>
