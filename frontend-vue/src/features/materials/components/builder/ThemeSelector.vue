<script setup lang="ts">
const emit = defineEmits<{
  apply: [theme: any]
}>()

const themes = [
  {
    name: 'Clásico Odiseo',
    config: {
      primaryTitleColor: '2, 113, 184',
      secondaryTitleColor: '2, 113, 184',
      backgroundHighlightColor: '214, 238, 253',
      fontFamily: 'Arial',
      borderRadius: '4px',
      marginTop: '3cm',
      marginBottom: '1.5cm',
      marginLeft: '1cm',
      marginRight: '1cm',
    }
  },
  {
    name: 'Minimalista Ligero',
    config: {
      primaryTitleColor: '33, 37, 41',
      secondaryTitleColor: '73, 80, 87',
      backgroundHighlightColor: '248, 249, 250',
      fontFamily: 'Inter',
      borderRadius: '0px',
      marginTop: '4cm',
      marginBottom: '2cm',
      marginLeft: '2cm',
      marginRight: '2cm',
    }
  },
  {
    name: 'Elegante Editorial',
    config: {
      primaryTitleColor: '0, 0, 0',
      secondaryTitleColor: '108, 117, 125',
      backgroundHighlightColor: '241, 243, 245',
      fontFamily: 'Merriweather',
      borderRadius: '8px',
      marginTop: '3.5cm',
      marginBottom: '2cm',
      marginLeft: '1.5cm',
      marginRight: '1.5cm',
    }
  }
]
</script>

<template>
  <div class="grid grid-cols-1 gap-3">
    <div
      v-for="theme in themes"
      :key="theme.name"
      class="border border-slate-200 dark:border-white/10 rounded-lg p-4 cursor-pointer hover:border-primary-500 transition-colors"
      @click="emit('apply', theme.config)"
    >
      <h4 class="font-bold text-sm mb-2 text-slate-800 dark:text-slate-200">{{ theme.name }}</h4>
      <div class="flex gap-2 items-center">
        <div class="w-6 h-6 rounded-full border border-slate-200" :style="{ backgroundColor: 'rgb(' + theme.config.primaryTitleColor + ')' }"></div>
        <div class="w-6 h-6 rounded-full border border-slate-200" :style="{ backgroundColor: 'rgb(' + theme.config.backgroundHighlightColor + ')' }"></div>
        <span class="text-xs text-slate-500 ml-auto">{{ theme.config.fontFamily }}</span>
      </div>
    </div>
  </div>
</template>
