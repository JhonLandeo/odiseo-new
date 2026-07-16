<template>
  <div>
    <!-- Floating Action Button -->
    <button 
      @click="isOpen = true"
      class="fixed bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-lg shadow-indigo-600/30 flex items-center justify-center transition-transform hover:scale-105 z-40 group"
      aria-label="Ayuda y Soporte"
    >
      <UIcon name="i-heroicons-question-mark-circle" class="w-8 h-8 group-hover:rotate-12 transition-transform" />
      
      <!-- Tooltip tooltip for FAB -->
      <span class="absolute -top-10 right-0 w-max bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        ¿Necesitas ayuda?
      </span>
    </button>

    <!-- Support Modal -->
    <UModal v-model:open="isOpen">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <UIcon name="i-heroicons-lifebuoy" class="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">Centro de Ayuda</h3>
            </div>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="isOpen = false" />
          </div>

          <div class="space-y-4">
            <!-- Flow Diagram Option -->
            <button 
              @click="showDiagram = true"
              class="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-left group"
            >
              <div class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50">
                <UIcon name="i-heroicons-map" class="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              </div>
              <div>
                <h4 class="font-semibold text-slate-800 dark:text-slate-200">¿Cómo funciona Odiseo?</h4>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Mira el diagrama del flujo principal del sistema para entender los pasos.</p>
              </div>
            </button>

            <!-- Reactivate Tour Option -->
            <button 
              @click="handleResetTour"
              class="w-full flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all text-left group"
            >
              <div class="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/50">
                <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-slate-600 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
              </div>
              <div>
                <h4 class="font-semibold text-slate-800 dark:text-slate-200">Volver a mostrar el tutorial</h4>
                <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">Reactiva el recorrido guiado paso a paso por la plataforma.</p>
              </div>
            </button>

            <!-- WhatsApp Option -->
            <a 
              href="https://wa.me/1234567890?text=Hola,%20necesito%20ayuda%20con%20Odiseo" 
              target="_blank"
              class="w-full flex items-start gap-4 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all text-left group"
            >
              <div class="p-2 bg-emerald-100 dark:bg-emerald-900/50 rounded-lg group-hover:bg-emerald-200 dark:group-hover:bg-emerald-800/50">
                <UIcon name="i-heroicons-chat-bubble-left-right" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 class="font-semibold text-emerald-800 dark:text-emerald-300">Contactar por WhatsApp</h4>
                <p class="text-sm text-emerald-600 dark:text-emerald-400/80 mt-1">Habla directamente con un asesor para resolver dudas complejas.</p>
              </div>
            </a>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Diagram Modal -->
    <UModal v-model:open="showDiagram" :ui="{ content: 'sm:max-w-5xl' }">
      <template #content>
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100">Flujo Principal de Odiseo</h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark" @click="showDiagram = false" />
          </div>
          
          <div class="bg-slate-50 dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div class="flex flex-col md:flex-row items-center justify-between gap-4 relative">
              <!-- Step 1 -->
              <div class="flex flex-col items-center z-10 w-40 text-center">
                <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center shadow-sm mb-3">
                  <UIcon name="i-heroicons-calendar-days" class="w-8 h-8" />
                </div>
                <h4 class="font-bold text-slate-800 dark:text-slate-200">1. Ciclo Académico</h4>
                <p class="text-xs text-slate-500 mt-1">Define el periodo, inicio y fin de las clases.</p>
              </div>

              <UIcon name="i-heroicons-arrow-right" class="w-6 h-6 text-slate-300 dark:text-slate-600 hidden md:block" />
              <UIcon name="i-heroicons-arrow-down" class="w-6 h-6 text-slate-300 dark:text-slate-600 block md:hidden" />

              <!-- Step 2 -->
              <div class="flex flex-col items-center z-10 w-40 text-center">
                <div class="w-16 h-16 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded-2xl flex items-center justify-center shadow-sm mb-3">
                  <UIcon name="i-heroicons-paint-brush" class="w-8 h-8" />
                </div>
                <h4 class="font-bold text-slate-800 dark:text-slate-200">2. Plantilla PDF</h4>
                <p class="text-xs text-slate-500 mt-1">Personaliza el diseño, logo y colores.</p>
              </div>

              <UIcon name="i-heroicons-arrow-right" class="w-6 h-6 text-slate-300 dark:text-slate-600 hidden md:block" />
              <UIcon name="i-heroicons-arrow-down" class="w-6 h-6 text-slate-300 dark:text-slate-600 block md:hidden" />

              <!-- Step 3 -->
              <div class="flex flex-col items-center z-10 w-40 text-center">
                <div class="w-16 h-16 bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center shadow-sm mb-3">
                  <UIcon name="i-heroicons-book-open" class="w-8 h-8" />
                </div>
                <h4 class="font-bold text-slate-800 dark:text-slate-200">3. Sílabo</h4>
                <p class="text-xs text-slate-500 mt-1">Asigna los temas por curso para cada semana.</p>
              </div>

              <UIcon name="i-heroicons-arrow-right" class="w-6 h-6 text-slate-300 dark:text-slate-600 hidden md:block" />
              <UIcon name="i-heroicons-arrow-down" class="w-6 h-6 text-slate-300 dark:text-slate-600 block md:hidden" />

              <!-- Step 4 -->
              <div class="flex flex-col items-center z-10 w-40 text-center">
                <div class="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center shadow-sm mb-3">
                  <UIcon name="i-heroicons-document-arrow-down" class="w-8 h-8" />
                </div>
                <h4 class="font-bold text-slate-800 dark:text-slate-200">4. Material</h4>
                <p class="text-xs text-slate-500 mt-1">Genera y descarga los exámenes y prácticas.</p>
              </div>
            </div>
          </div>
          
          <div class="mt-6 flex justify-end">
            <UButton color="neutral" variant="ghost" class="btn-premium-primary" @click="showDiagram = false">Entendido</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useOnboardingStore } from '@/features/onboarding/store/onboarding'
import { useToast } from '#imports'

const isOpen = ref(false)
const showDiagram = ref(false)

const onboardingStore = useOnboardingStore()
const toast = useToast()

async function handleResetTour() {
  try {
    await onboardingStore.resetTour()
    isOpen.value = false
    toast.add({
      title: 'Tour reiniciado',
      description: 'El recorrido interactivo se ha activado nuevamente.',
      color: 'success',
      timeout: 4000
    })
  } catch (e: any) {
    toast.add({
      title: 'Error',
      description: e.message || 'No se pudo reiniciar el tour',
      color: 'error'
    })
  }
}
</script>
