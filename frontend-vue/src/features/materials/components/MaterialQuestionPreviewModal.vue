<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  modelValue: boolean;
  question: any | null;
}>();

const emit = defineEmits(['update:modelValue']);

const isOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

const layoutClass = computed(() => {
  if (!props.question) return 'grid-cols-1';
  // configAlternative: 1 -> 1 col, 2 -> 2 cols, 3 -> 1 line inline (not supported well in CSS grid, but let's map it roughly)
  const cfg = props.question.configAlternative || 1;
  if (cfg === 1) return 'grid-cols-1';
  if (cfg === 2) return 'grid-cols-2';
  if (cfg === 3 || cfg === 4 || cfg === 5) return 'grid-cols-2 sm:grid-cols-4';
  return 'grid-cols-1'; // Default
});
</script>

<template>
  <Teleport to="body">
    <Transition enter-active-class="transition-opacity duration-200" enter-from-class="opacity-0"
      enter-to-class="opacity-100" leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100" leave-to-class="opacity-0">
      <div v-if="isOpen" class="fixed inset-0 bg-slate-900/50 dark:bg-black/60 backdrop-blur-md z-[10005]" @click="isOpen = false" />
    </Transition>

    <Transition enter-active-class="transition-all duration-250 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-4" enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-150 ease-in" leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-4">
      <div v-if="isOpen" class="fixed inset-0 z-[10006] flex items-center justify-center p-4 sm:p-6 pointer-events-none">
        <div class="bg-slate-100 dark:bg-[#1a1b2e] rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col pointer-events-auto border border-slate-200 dark:border-slate-800">
          
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#202136] rounded-t-2xl shrink-0">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-heroicons-printer" class="text-slate-500 w-5 h-5" />
              Simulador de Impresión (PDF)
            </h3>
            <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpen = false" />
          </div>

      <!-- Simulated Paper Canvas -->
      <div class="py-6 flex justify-center bg-slate-200 dark:bg-[#0f1019] overflow-y-auto max-h-[70vh] rounded-xl inner-shadow">
        <div class="bg-white text-black w-full max-w-[210mm] min-h-[297mm] shadow-xl p-10 font-serif text-[13px] leading-relaxed relative mx-4 shrink-0">
          
          <div v-if="!question" class="text-center text-slate-400 py-20">
            Cargando simulación...
          </div>
          
          <div v-else class="space-y-4">
            <!-- Simulated question number & code -->
            <div class="flex items-start gap-2">
              <span class="font-bold">{{ question.position || 1 }}.</span>
              <div class="flex-1">
                <!-- Content -->
                <div class="prose prose-sm max-w-none text-black prose-p:my-1 prose-img:max-w-xs prose-img:mx-auto" v-html="question.htmlContent"></div>
                
                <!-- Extra Images if any -->
                <div v-if="question.images?.length" class="mt-4 flex flex-wrap justify-center gap-4">
                  <img v-for="img in question.images" :key="img.id" :src="img.url" class="max-h-48 object-contain" />
                </div>

                <!-- Alternatives -->
                <div v-if="question.options?.length" class="mt-5 grid gap-x-6 gap-y-2" :class="layoutClass">
                  <div v-for="opt in question.options" :key="opt.label" class="flex items-start gap-2">
                    <span class="font-bold shrink-0">{{ opt.label }})</span>
                    <div v-html="opt.text" class="prose prose-sm max-w-none text-black prose-p:my-0"></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="absolute bottom-6 right-8 text-[9px] text-slate-400 font-sans tracking-widest uppercase">
              CÓDIGO: {{ question.code || question.questionId }} | {{ question.type }}
            </div>
          </div>
        </div>
      </div>
      
      <div class="text-center text-xs text-slate-500 py-4 font-medium shrink-0 bg-white dark:bg-[#202136] border-t border-slate-200 dark:border-slate-800 rounded-b-2xl">
        Nota: Esta es una simulación visual. Las proporciones y saltos de página reales dependerán del motor PDF final.
      </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.inner-shadow {
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.05);
}
</style>
