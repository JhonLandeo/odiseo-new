<script setup lang="ts">
import { ref } from 'vue'
import { useToast } from '#imports'
import PdfDesignList from './PdfDesignList.vue'
import PdfDesignForm from './PdfDesignForm.vue'

const isOpen = defineModel<boolean>('isOpen', { default: false })
const toast = useToast()

type ViewMode = 'list' | 'form'
const view = ref<ViewMode>('list')
const editingId = ref<string | undefined>()

function openCreate() {
  editingId.value = undefined
  view.value = 'form'
}

function openEdit(id: string) {
  editingId.value = id
  view.value = 'form'
}

function handleSaved() {
  view.value = 'list'
  toast.add({ title: 'Plantilla guardada', color: 'success', duration: 2000 })
}

function handleCancelled() {
  view.value = 'list'
  editingId.value = undefined
}
</script>

<template>
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
        class="fixed inset-y-0 right-0 w-full bg-white dark:bg-[#11111a] shadow-2xl z-50 flex flex-col border-l border-slate-200 dark:border-white/5 transition-all duration-300"
        :class="view === 'form' ? 'max-w-6xl' : 'max-w-xl'">
        <div class="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-white/5 shrink-0">
          <div class="flex items-center gap-3">
            <div
              class="p-2.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl border border-indigo-100 dark:border-indigo-500/20">
              <UIcon name="i-heroicons-paint-brush" class="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 class="text-lg font-bold text-slate-900 dark:text-white">Plantillas de Diseño</h2>
              <p class="text-xs text-slate-500 dark:text-slate-400">Personaliza la apariencia de tus PDFs</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <UButton v-if="view === 'list'" color="primary" size="xs" icon="i-heroicons-plus" @click="openCreate">Nueva Plantilla</UButton>
            <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="() => { isOpen = false }" />
          </div>
        </div>

        <div class="flex-1 overflow-y-auto p-6">
          <PdfDesignList v-if="view === 'list'" @create="openCreate" @edit="openEdit" />
          <PdfDesignForm v-else :design-id="editingId" @saved="handleSaved" @cancelled="handleCancelled" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
