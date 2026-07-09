<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  question: any | null;
}>();

const emit = defineEmits(['cancel']);

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
  <div class="flex flex-col h-full bg-slate-100 dark:bg-[#1a1a24] rounded-2xl overflow-hidden relative border border-slate-200 dark:border-white/5">
          
          <div class="flex items-center gap-4 px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white dark:bg-[#20202b] rounded-t-2xl shrink-0 z-20 shadow-sm">
            <UButton color="neutral" variant="soft" icon="i-heroicons-arrow-left-20-solid" class="rounded-xl" @click="emit('cancel')" />
            <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UIcon name="i-heroicons-printer" class="text-slate-500 w-5 h-5" />
              Simulador de Impresión (PDF)
            </h3>
          </div>

      <!-- Simulated Paper Canvas -->
      <div class="py-6 flex-1 flex justify-center bg-slate-200 dark:bg-[#0f1019] overflow-y-auto custom-scrollbar inner-shadow">
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
      
      <div class="text-center text-xs text-slate-500 py-4 font-medium shrink-0 bg-white dark:bg-[#20202b] border-t border-slate-200 dark:border-white/5 rounded-b-2xl">
        Nota: Esta es una simulación visual. Las proporciones y saltos de página reales dependerán del motor PDF final.
      </div>
  </div>
</template>

<style scoped>
.inner-shadow {
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.05);
}
</style>
