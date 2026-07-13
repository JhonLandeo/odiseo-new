<script setup lang="ts">
import { ref } from 'vue'
import { useOnboardingStore } from '@/features/onboarding/store/onboarding'
import PdfDesignList from '@/features/materials/components/PdfDesignList.vue'
import PdfDesignForm from '@/features/materials/components/PdfDesignForm.vue'
import { useToast } from '#imports'

definePageMeta({ layout: 'b2b', permissions: ['generate_material'] })

type View = 'list' | 'editor'
const currentView = ref<View>('list')
const editingId = ref<string | null>(null)

function openNew() {
  editingId.value = null
  currentView.value = 'editor'
}

function openEdit(id: string) {
  editingId.value = id
  currentView.value = 'editor'
}

function goBack() {
  currentView.value = 'list'
  editingId.value = null
}

const onboardingStore = useOnboardingStore()
const toast = useToast()
const isClearing = ref(false)
const showClearConfirm = ref(false)

async function handleClearDemo() {
  isClearing.value = true
  try {
    await onboardingStore.clearDemoData()
    showClearConfirm.value = false
    toast.add({
      title: 'Datos demo eliminados',
      description: 'Tu plataforma está lista para comenzar con datos reales.',
      color: 'success',
      timeout: 4000,
    })
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error', timeout: 5000 })
  } finally {
    isClearing.value = false
  }
}
</script>

<template>
  <!-- List View -->
  <template v-if="currentView === 'list'">
    <div class="px-8 py-6 max-w-full space-y-6">
      <div class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-6 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/50 dark:border-slate-700/30">
        <div class="flex items-center gap-4">
          <div class="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
            <UIcon name="i-heroicons-paint-brush" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 class="text-3xl font-extrabold tracking-tight text-slate-800 dark:text-slate-100">Plantillas de Diseño PDF</h1>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Personaliza la apariencia de los PDFs generados</p>
          </div>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-plus" size="md" class="btn-premium-primary" @click="openNew">
          Nueva plantilla
        </UButton>
      </div>
      <PdfDesignList @create="openNew" @edit="openEdit" />

      <!-- Demo Data Cleanup Card -->
      <div
        v-if="onboardingStore.stepsCompleted.includes('load_demo_or_create_cycle')"
        class="mt-6 p-5 rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-950/20 flex flex-col sm:flex-row sm:items-center gap-4"
      >
        <div class="flex-1">
          <p class="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
            <UIcon name="i-heroicons-beaker" class="w-4 h-4" />
            Datos de demostración activos
          </p>
          <p class="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
            La plataforma tiene ciclos y sílabos de prueba cargados. Elimínalos cuando estés listo para comenzar con información real.
          </p>
        </div>
        <UButton
          v-if="!showClearConfirm"
          color="warning"
          variant="soft"
          size="sm"
          icon="i-heroicons-trash"
          @click="showClearConfirm = true"
        >
          Limpiar datos demo
        </UButton>
        <div v-else class="flex items-center gap-2">
          <span class="text-xs text-amber-800 dark:text-amber-300 font-medium">¿Confirmar?</span>
          <UButton size="xs" color="error" :loading="isClearing" @click="handleClearDemo">Sí, eliminar</UButton>
          <UButton size="xs" color="neutral" variant="ghost" @click="showClearConfirm = false">Cancelar</UButton>
        </div>
      </div>
    </div>
  </template>

  <!-- Editor View -->
  <template v-else>
    <div class="px-8 py-6 max-w-full space-y-6 bg-slate-50/50 dark:bg-[#0f1117] min-h-screen">
      <div class="sticky top-0 z-30 bg-white dark:bg-[#1e1e2d] -mt-6 -mx-8 px-8 pt-5 pb-4 flex items-center justify-between border-b border-slate-200/50 dark:border-slate-700/30">
        <div class="flex items-center gap-3">
          <UButton color="gray" variant="ghost" icon="i-heroicons-arrow-left" @click="goBack" size="sm" />
          <span class="text-sm font-bold text-slate-700 dark:text-slate-300">
            {{ editingId ? 'Editar plantilla' : 'Nueva plantilla' }}
          </span>
        </div>
      </div>
      <PdfDesignForm :design-id="editingId || undefined" @saved="goBack" @cancelled="goBack" />
    </div>
  </template>
</template>
