<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder?: string
  collapsibleToolbar?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement | null>(null)
let isComposing = false
let savedRange: Range | null = null

function saveSelection() {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0 && editorRef.value?.contains(selection.anchorNode)) {
    savedRange = selection.getRangeAt(0)
  }
}

function restoreSelection() {
  if (savedRange) {
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(savedRange)
  }
}

function applyFormat(command: string, value?: string) {
  restoreSelection()
  document.execCommand(command, false, value)
  editorRef.value?.focus()
  saveSelection()
  updateValue()
}

function updateValue() {
  if (!editorRef.value || isComposing) return
  const html = editorRef.value.innerHTML
  if (html !== props.modelValue) {
    emit('update:modelValue', html)
  }
}

function handleCompositionStart() {
  isComposing = true
}

function handleCompositionEnd() {
  isComposing = false
  updateValue()
}

watch(() => props.modelValue, (newVal) => {
  if (editorRef.value && editorRef.value.innerHTML !== newVal) {
    editorRef.value.innerHTML = newVal || ''
  }
})

onMounted(() => {
  if (editorRef.value) {
    editorRef.value.innerHTML = props.modelValue || ''
  }
})

const showToolbar = ref(!props.collapsibleToolbar)
</script>

<template>
  <div class="relative border border-slate-200 dark:border-white/10 rounded-md overflow-hidden bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-primary focus-within:border-primary transition-shadow">
    
    <!-- Collapsible Toolbar Toggle (When hidden) -->
    <div v-if="collapsibleToolbar && !showToolbar" class="absolute right-1.5 top-1.5 z-10">
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-heroicons-adjustments-horizontal"
        @click="() => { showToolbar = true }"
        title="Personalizar texto"
        class="opacity-60 hover:opacity-100 rounded-md bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 shadow-sm hover:shadow transition-all duration-200"
      />
    </div>

    <!-- Toolbar -->
    <div v-if="showToolbar" class="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-1 p-1">
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-bold" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('bold')"  title="Negrita" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-italic" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('italic')"  title="Cursiva" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-underline" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('underline')"  title="Subrayado" />
      <div class="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-bars-3-bottom-left" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('justifyLeft')"  title="Izquierda" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-bars-3" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('justifyCenter')"  title="Centro" />
      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-bars-3-bottom-right" class="w-6 h-6 p-0 flex items-center justify-center" @click.prevent="applyFormat('justifyRight')"  title="Derecha" />
      <div class="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
      
      <!-- Font Family Picker -->
      <div title="Tipografía" class="relative">
        <select class="text-[11px] py-1 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded cursor-pointer outline-none" @change="e => applyFormat('fontName', (e.target as HTMLSelectElement).value)">
          <option value="Arial" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Arial</option>
          <option value="Courier New" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Courier</option>
          <option value="Georgia" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Georgia</option>
          <option value="Times New Roman" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Times</option>
          <option value="Verdana" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Verdana</option>
        </select>
      </div>

      <!-- Font Size Picker -->
      <div title="Tamaño" class="relative">
        <select class="text-[11px] py-1 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded cursor-pointer outline-none" @change="e => applyFormat('fontSize', (e.target as HTMLSelectElement).value)">
          <option value="1" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">8pt</option>
          <option value="2" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">10pt</option>
          <option value="3" selected class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">12pt</option>
          <option value="4" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">14pt</option>
          <option value="5" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">18pt</option>
          <option value="6" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">24pt</option>
          <option value="7" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">36pt</option>
        </select>
      </div>

      <div class="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
        <!-- Color Picker Tool -->
        <div title="Color del Texto" class="relative w-6 h-6 rounded flex items-center justify-center overflow-hidden border border-slate-300 dark:border-slate-600 cursor-pointer">
          <input type="color" class="absolute inset-0 w-8 h-8 -top-1 -left-1 cursor-pointer" @input="e => applyFormat('foreColor', (e.target as HTMLInputElement).value)" />
        </div>
        
        <div v-if="collapsibleToolbar" class="ml-auto">
           <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-x-mark" @click="() => { showToolbar = false }" title="Ocultar herramientas" />
        </div>
    </div>
    <!-- Editor -->
    <div
      ref="editorRef"
      contenteditable="true"
      :class="[
        'p-2 min-h-[60px] text-sm outline-none overflow-y-auto max-h-[150px] empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 dark:empty:before:text-slate-500 cursor-text break-words text-slate-800 dark:text-slate-100',
        collapsibleToolbar && !showToolbar ? 'pr-9' : ''
      ]"
      :data-placeholder="placeholder"
      @input="updateValue"
      @mouseup="saveSelection"
      @keyup="saveSelection"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
      @blur="saveSelection(); updateValue()"
    ></div>
  </div>
</template>

<style scoped>
/* Fallback icons since generic heroicons don't have literal 'bold'/'italic' in older versions, but NuxtUI handles icons dynamically, let's assume standard variants or use standard text if missing */
</style>
