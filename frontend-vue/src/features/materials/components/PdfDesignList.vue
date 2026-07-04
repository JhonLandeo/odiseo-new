<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useToast } from '#imports'
import { usePdfDesignsStore } from '../store/pdfDesigns'

const store = usePdfDesignsStore()
const toast = useToast()

const emit = defineEmits<{
  edit: [id: string]
  create: []
}>()

const isConfirmOpen = ref(false)
const designToDelete = ref<{ id: string; name: string; isDefault: boolean } | null>(null)
const deleting = ref(false)

const isFirstLoad = ref(true)

onMounted(async () => {
  try {
    await store.fetchDesigns()
  } finally {
    isFirstLoad.value = false
  }
})

function showDeleteConfirm(design: { id: string; name: string; isDefault: boolean }) {
  designToDelete.value = design
  isConfirmOpen.value = true
}

async function confirmDelete() {
  if (!designToDelete.value) return
  deleting.value = true
  try {
    await store.deleteDesign(designToDelete.value.id)
    toast.add({ title: 'Plantilla eliminada', color: 'success' })
    isConfirmOpen.value = false
  } catch (e: any) {
    const msg = e?.data?.message || e?.message || 'No se pudo eliminar'
    toast.add({ title: msg, color: 'error' })
  } finally {
    deleting.value = false
    designToDelete.value = null
  }
}
</script>

<template>
  <div class="w-full">
    <div v-if="store.isLoading || isFirstLoad" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      <div v-for="n in 4" :key="n" class="flex flex-col bg-white dark:bg-[#252536] rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden h-[220px]">
        <div class="bg-slate-50 dark:bg-[#1a1a24] p-4 flex items-center justify-center border-b border-slate-100 dark:border-slate-700/60 h-44">
          <USkeleton class="w-[90px] h-[127px] rounded-[2px]" />
        </div>
        <div class="p-3.5 flex items-center justify-between gap-2">
          <USkeleton class="h-4 w-2/3 rounded" />
          <USkeleton class="h-[18px] w-[18px] rounded shrink-0" />
        </div>
      </div>
    </div>

    <div v-else-if="store.designs.length === 0"
      class="py-16 text-center bg-slate-50 dark:bg-white/[0.02] rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
      <UIcon name="i-heroicons-paint-brush" class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400">No hay plantillas de diseño</p>
      <p class="text-xs text-slate-400 dark:text-slate-500 mt-1">Crea la primera para personalizar tus PDFs.</p>
    </div>

    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
      <div v-for="design in store.designs" :key="design.id"
        class="group relative flex flex-col bg-white dark:bg-[#252536] rounded-xl border border-slate-200 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all duration-200 cursor-pointer overflow-hidden"
        @click="emit('edit', design.id)">
        
        <!-- Miniatura del PDF (A4 Aspect Ratio: 1:1.414) -->
        <div class="bg-slate-50 dark:bg-[#1a1a24] p-4 flex items-center justify-center border-b border-slate-100 dark:border-slate-700/60 h-44 relative">
          <div class="w-[90px] h-[127px] bg-white shadow-sm ring-1 ring-slate-900/10 rounded-[2px] flex flex-col relative overflow-hidden transition-transform duration-300 group-hover:scale-105 group-hover:shadow-md">
             
             <!-- Mini Header / Banner -->
             <div v-if="design.bannerImageUrl" class="h-[18px] w-full bg-cover bg-center shrink-0" :style="{ backgroundImage: `url(${design.bannerImageUrl})` }"></div>
             <div v-else class="h-[14px] w-full shrink-0 flex items-center px-1.5 border-b border-slate-100" :style="{ backgroundColor: 'rgba(' + (design.backgroundHighlightColor || '214, 238, 253') + ', 0.3)' }">
                <div class="h-[3px] w-1/3 rounded-full" :style="{ backgroundColor: 'rgb(' + (design.primaryTitleColor || '2, 113, 184') + ')' }"></div>
             </div>

             <!-- Content lines (CSS Skeleton) -->
             <div class="flex-1 p-2 space-y-1.5 flex flex-col relative z-10">
                <div class="h-[3px] w-3/4 rounded-full mb-1" :style="{ backgroundColor: 'rgb(' + (design.secondaryTitleColor || '2, 113, 184') + ')' }"></div>
                
                <div class="space-y-[3px]">
                  <div class="h-[2px] w-full bg-slate-200"></div>
                  <div class="h-[2px] w-5/6 bg-slate-200"></div>
                  <div class="h-[2px] w-full bg-slate-200"></div>
                  <div class="h-[2px] w-4/6 bg-slate-200"></div>
                </div>
                
                <div class="h-[3px] w-1/2 rounded-full mt-2 mb-1" :style="{ backgroundColor: 'rgb(' + (design.secondaryTitleColor || '2, 113, 184') + ')' }"></div>
                <div class="space-y-[3px]">
                  <div class="h-[2px] w-full bg-slate-200"></div>
                  <div class="h-[2px] w-5/6 bg-slate-200"></div>
                </div>
             </div>

             <!-- Mini Footer -->
             <div class="h-[10px] w-full shrink-0 border-t border-slate-100 flex items-center justify-between px-1.5 relative z-10">
                <div class="h-[1.5px] w-1/4" :style="{ backgroundColor: 'rgb(' + (design.primaryTitleColor || '2, 113, 184') + ')' }"></div>
                <div class="h-[1.5px] w-1/6 bg-slate-300"></div>
             </div>

             <!-- Mini Watermark overlay -->
             <div v-if="design.watermarkImageUrl" class="absolute inset-0 flex items-center justify-center pointer-events-none opacity-10">
                <div class="w-12 h-12 bg-contain bg-no-repeat bg-center" :style="{ backgroundImage: `url(${design.watermarkImageUrl})` }"></div>
             </div>
          </div>

          <!-- Default overlay badge inside thumbnail container -->
          <div v-if="design.isDefault" class="absolute top-2 left-2 flex items-center gap-1 bg-white/90 dark:bg-slate-800/90 backdrop-blur-sm px-1.5 py-0.5 rounded shadow-sm border border-slate-200/50 dark:border-white/10 z-10">
            <UIcon name="i-heroicons-star-solid" class="w-2.5 h-2.5 text-amber-500" />
            <span class="text-[8px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-widest">Default</span>
          </div>
        </div>

        <!-- Footer Action area -->
        <div class="p-3.5 flex items-start justify-between gap-2">
          <div class="flex flex-col min-w-0">
            <h4 class="text-[13px] font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" :title="design.name">
              {{ design.name }}
            </h4>
            <div class="flex items-center gap-1 mt-1">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-900/30" title="Ciclos Académicos que usan esta plantilla">
                <UIcon name="i-heroicons-academic-cap" class="w-3 h-3" />
                {{ design.cycleCount ?? 0 }} {{ (design.cycleCount ?? 0) === 1 ? 'Ciclo' : 'Ciclos' }}
              </span>
            </div>
          </div>

          <button
            @click.stop="showDeleteConfirm(design)"
            class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors shrink-0 self-start mt-0.5"
            title="Eliminar"
          >
            <UIcon name="i-heroicons-trash" class="w-[14px] h-[14px]" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Confirmación de Eliminación -->
    <UModal v-model:open="isConfirmOpen">
      <template #content>
        <UCard>
          <div class="p-4 flex flex-col items-center text-center">
            <!-- Icono de Advertencia -->
            <div class="w-12 h-12 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-600 dark:text-red-400 mb-4 ring-8 ring-red-50/50 dark:ring-red-900/10">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 animate-pulse" />
            </div>

            <!-- Título -->
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
              ¿Eliminar plantilla de diseño?
            </h3>

            <!-- Descripción -->
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
              Estás a punto de eliminar la plantilla <strong class="text-slate-800 dark:text-slate-200">"{{ designToDelete?.name }}"</strong>. Esta acción no se puede deshacer.
            </p>

            <!-- Alerta si es por defecto -->
            <div v-if="designToDelete?.isDefault" class="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-900/30 rounded-lg text-left flex gap-2.5 items-start">
              <UIcon name="i-heroicons-information-circle" class="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p class="text-[11px] text-amber-800 dark:text-amber-300 leading-normal">
                <strong>Aviso importante:</strong> Esta es la plantilla predeterminada global. Si la eliminas, el sistema usará la plantilla base sin estilos personalizados para generar nuevos PDFs.
              </p>
            </div>

            <!-- Botones de Acción -->
            <div class="flex items-center gap-3 w-full mt-6">
              <UButton 
                variant="outline" 
                color="neutral" 
                class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
                @click="isConfirmOpen = false"
              >
                Cancelar
              </UButton>
              <UButton 
                color="error" 
                class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
                :loading="deleting"
                @click="confirmDelete"
              >
                Confirmar Eliminación
              </UButton>
            </div>
          </div>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
