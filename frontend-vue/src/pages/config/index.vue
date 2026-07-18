<script setup lang="ts">
import { ref } from 'vue'
import { useOnboardingStore } from '@/features/onboarding/store/onboarding'
import PdfDesignList from '@/features/materials/components/PdfDesignList.vue'
import PdfDesignForm from '@/features/materials/components/PdfDesignForm.vue'
import { useToast } from '#imports'
import { PERMISSIONS } from '@/core/auth/permissions'

definePageMeta({ layout: 'b2b', permissions: [PERMISSIONS.EDIT_MATERIALS] })

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
        <div class="flex gap-2">
          <UButton id="tour-create-template" color="neutral" variant="ghost" icon="i-heroicons-plus" size="md" class="btn-premium-primary" @click="openNew">
            Nueva plantilla
          </UButton>
        </div>
      </div>
      <PdfDesignList @create="openNew" @edit="openEdit" />
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
