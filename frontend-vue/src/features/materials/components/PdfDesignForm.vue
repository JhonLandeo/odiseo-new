<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { usePdfDesignsStore, type PdfDesignTemplate } from '../store/pdfDesigns'
import { computed } from 'vue'

function rgbToHex(rgbStr: string): string {
  const parts = rgbStr.split(',').map(p => parseInt(p.trim()))
  if (parts.length !== 3 || parts.some(isNaN)) return '#000000'
  return '#' + parts.map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('')
}

function hexToRgbStr(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '0, 0, 0'
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
}

import PdfDesignPreview from './PdfDesignPreview.vue'
import RichTextInput from './RichTextInput.vue'
import { useToast } from '#imports'

const toast = useToast()

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text)
    toast.add({
      title: 'Variable copiada',
      description: `Se copió ${text} al portapapeles.`,
      icon: 'i-heroicons-check-circle',
      color: 'success'
    })
  } catch (err) {
    toast.add({
      title: 'Error',
      description: 'No se pudo copiar al portapapeles.',
      icon: 'i-heroicons-x-circle',
      color: 'error'
    })
  }
}

const props = defineProps<{
  designId?: string
}>()

const emit = defineEmits<{
  saved: []
  cancelled: []
}>()

const store = usePdfDesignsStore()
const isEditing = ref(false)
const submitting = ref(false)

const zoom = ref(85)
function zoomIn() { if (zoom.value < 150) zoom.value += 10 }
function zoomOut() { if (zoom.value > 40) zoom.value -= 10 }
function resetZoom() { zoom.value = 85 }

const bannerFile = ref<File | null>(null)
const watermarkFile = ref<File | null>(null)
const coverFile = ref<File | null>(null)

const bannerPreview = ref<string | null>(null)
const watermarkPreview = ref<string | null>(null)
const coverPreview = ref<string | null>(null)
const focusedSection = ref<string | null>(null)

function setFocus(section: string | null) {
  if (focusedSection.value !== section) {
    focusedSection.value = section
    updatePreview()
  }
}

const gridFiles: Record<string, File> = {}

const previewHtml = ref('')
const loadingPreview = ref(false)
let debounceTimeout: any = null

const form = ref<Partial<PdfDesignTemplate>>({
  name: '',
  showCover: false,
  primaryTitleColor: '2, 113, 184',
  secondaryTitleColor: '2, 113, 184',
  backgroundHighlightColor: '214, 238, 253',
  marginTop: '3cm',
  marginBottom: '1.5cm',
  marginInside: '1cm',
  marginOutside: '1cm',
  isBookMode: false,
  fontFamily: 'Arial',
  contentFontSize: '11pt',
  contentTextColor: '#000000',
  borderRadius: '4px',
  blocksConfig: ['cover', 'banner', 'topics', 'content'],
  headerConfig: { left: '', center: '', right: '' },
  footerConfig: { left: '', center: '', right: '' },
  isDefault: false,
})

type GridMode = 'text' | 'image'
const gridModes = ref({
  header: { left: 'text' as GridMode, center: 'text' as GridMode, right: 'text' as GridMode },
  footer: { left: 'text' as GridMode, center: 'text' as GridMode, right: 'text' as GridMode }
})

const isImageUrl = (val: string) => val && (typeof val === 'string') && (val.startsWith('http') || val.startsWith('data:image'));




const parseMargin = (val: string) => parseFloat(val) || 0;
const formatMargin = (val: number) => `${val}cm`;

const marginNumTop = computed({
  get: () => parseMargin(form.value.marginTop || ''),
  set: (val) => { form.value.marginTop = formatMargin(val) }
})
const marginNumBottom = computed({
  get: () => parseMargin(form.value.marginBottom || ''),
  set: (val) => { form.value.marginBottom = formatMargin(val) }
})
const marginNumInside = computed({
  get: () => parseMargin(form.value.marginInside || ''),
  set: (val) => { form.value.marginInside = formatMargin(val) }
})
const marginNumOutside = computed({
  get: () => parseMargin(form.value.marginOutside || ''),
  set: (val) => { form.value.marginOutside = formatMargin(val) }
})

const contentFontSizeNum = computed({
  get: () => parseFloat(form.value.contentFontSize || '11') || 11,
  set: (val) => { form.value.contentFontSize = `${val}pt` }
})

const accentColorHex = computed({
  get: () => rgbToHex(form.value.secondaryTitleColor || '2, 113, 184'),
  set: (val) => { form.value.secondaryTitleColor = hexToRgbStr(val) || '2, 113, 184' }
})


function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
  })
}

async function onGridImageChange(e: Event, zone: 'header' | 'footer', position: 'left' | 'center' | 'right') {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    const file = input.files[0]
    const key = `${zone}-${position}`
    gridFiles[key] = file
    const b64 = await fileToBase64(file)
    if (zone === 'header') (form.value.headerConfig as any)[position] = b64
    if (zone === 'footer') (form.value.footerConfig as any)[position] = b64
    input.value = ''
  }
}

function clearGridSlot(zone: 'header' | 'footer', position: 'left' | 'center' | 'right') {
  const config = zone === 'header' ? form.value.headerConfig : form.value.footerConfig
  ;(config as any)[position] = ''
  delete gridFiles[`${zone}-${position}`]
  gridModes.value[zone][position] = 'text'
}

function updatePreview() {
  if (debounceTimeout) clearTimeout(debounceTimeout)
  debounceTimeout = setTimeout(async () => {
    loadingPreview.value = true
    try {
      const overrides = {
        ...form.value,
        bannerImageUrl: bannerPreview.value,
        watermarkImageUrl: watermarkPreview.value,
        coverImageUrl: coverPreview.value,
        focusedSection: focusedSection.value
      }
      previewHtml.value = await store.fetchPreview(props.designId || 'new', overrides)
    } catch (e) {
      console.error(e)
    } finally {
      loadingPreview.value = false
    }
  }, 400)
}

watch(form, updatePreview, { deep: true })
watch([bannerPreview, watermarkPreview, coverPreview], updatePreview)

onMounted(async () => {
  if (props.designId) {
    isEditing.value = true
    const design = await store.fetchDesign(props.designId)
    if (design) {
      form.value.name = design.name
      form.value.primaryTitleColor = design.primaryTitleColor || '2, 113, 184'
      form.value.secondaryTitleColor = design.secondaryTitleColor || '2, 113, 184'
      form.value.backgroundHighlightColor = design.backgroundHighlightColor || '214, 238, 253'
      form.value.headerConfig = design.headerConfig || { left: '', center: '', right: '' }
      form.value.footerConfig = design.footerConfig || { left: '', center: '', right: '' }
      form.value.isDefault = design.isDefault
      form.value.showCover = design.showCover || false
      form.value.marginTop = design.marginTop || '3cm'
      form.value.marginBottom = design.marginBottom || '1.5cm'
      form.value.marginInside = design.marginInside || '1cm'
      form.value.marginOutside = design.marginOutside || '1cm'
      form.value.isBookMode = design.isBookMode || false
      form.value.fontFamily = design.fontFamily || 'Arial'
      form.value.borderRadius = design.borderRadius || '4px'
      form.value.blocksConfig = design.blocksConfig || ['cover', 'banner', 'topics', 'content']

      bannerPreview.value = design.bannerImageUrl
      watermarkPreview.value = design.watermarkImageUrl
      coverPreview.value = design.coverImageUrl
    }
  } else {
    // defaults for new template
    form.value.headerConfig = { left: '', center: '', right: '{curso}' }
    form.value.footerConfig = { left: '{institucion_nombre}', center: '', right: 'Pág. {pagina} de {total_paginas}' }
  }

  ['left', 'center', 'right'].forEach(pos => {
    gridModes.value.header[pos as 'left' | 'center' | 'right'] = isImageUrl((form.value.headerConfig as any)[pos]) ? 'image' : 'text';
    gridModes.value.footer[pos as 'left' | 'center' | 'right'] = isImageUrl((form.value.footerConfig as any)[pos]) ? 'image' : 'text';
  });

  updatePreview()
})

function onBannerChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    bannerFile.value = input.files[0]
    bannerPreview.value = URL.createObjectURL(input.files[0])
  }
}

function onWatermarkChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    watermarkFile.value = input.files[0]
    watermarkPreview.value = URL.createObjectURL(input.files[0])
  }
}

function onCoverChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.[0]) {
    coverFile.value = input.files[0]
    coverPreview.value = URL.createObjectURL(input.files[0])
  }
}

async function removeBanner() {
  if (props.designId) await store.deleteAsset(props.designId, 'banner')
  bannerPreview.value = null
  bannerFile.value = null
}

async function removeWatermark() {
  if (props.designId) await store.deleteAsset(props.designId, 'watermark')
  watermarkPreview.value = null
  watermarkFile.value = null
}

async function removeCover() {
  if (props.designId) await store.deleteAsset(props.designId, 'cover')
  coverPreview.value = null
  coverFile.value = null
}

async function handleSubmit() {
  if (!form.value.name || !form.value.name.trim()) {
    toast.add({
      title: 'Validación de Formulario',
      description: 'El nombre de la plantilla es obligatorio.',
      icon: 'i-heroicons-exclamation-circle',
      color: 'error'
    })
    return
  }
  submitting.value = true
  try {
    const uploadGridFiles = async (designId: string) => {
      for (const key in gridFiles) {
        const file = gridFiles[key]
        const [zone, pos] = key.split('-')

        // Skip if this zone is currently in 'text' mode
        const currentMode = zone === 'header'
          ? gridModes.value.header[pos as 'left' | 'center' | 'right']
          : gridModes.value.footer[pos as 'left' | 'center' | 'right'];
        if (currentMode === 'text') continue;

        const url = await store.uploadAsset(designId, file, 'grid_image')
        if (zone === 'header') (form.value.headerConfig as any)[pos] = url
        if (zone === 'footer') (form.value.footerConfig as any)[pos] = url
      }
    }

    if (isEditing.value && props.designId) {
      await uploadGridFiles(props.designId)
      await store.updateDesign(props.designId, form.value)
      if (bannerFile.value) await store.uploadAsset(props.designId, bannerFile.value, 'banner')
      if (watermarkFile.value) await store.uploadAsset(props.designId, watermarkFile.value, 'watermark')
      if (coverFile.value) await store.uploadAsset(props.designId, coverFile.value, 'cover')
    } else {
      const created = await store.createDesign(form.value)
      if (created) {
        let needsUpdate = false
        if (Object.keys(gridFiles).length > 0) {
          await uploadGridFiles(created.id)
          needsUpdate = true
        }
        if (needsUpdate) {
          await store.updateDesign(created.id, form.value)
        }
        if (bannerFile.value) await store.uploadAsset(created.id, bannerFile.value, 'banner')
        if (watermarkFile.value) await store.uploadAsset(created.id, watermarkFile.value, 'watermark')
        if (coverFile.value) await store.uploadAsset(created.id, coverFile.value, 'cover')
      }
    }
    emit('saved')
  } catch {
  } finally {
    submitting.value = false
  }
}

const variablesHelper = [
  { token: '{curso}', desc: 'Nombre del curso actual' },
  { token: '{temas}', desc: 'Consolidado de temas abarcados' },
  { token: '{pagina}', desc: 'Número de página actual' },
  { token: '{total_paginas}', desc: 'Total de páginas del PDF' },
  { token: '{semana_numero}', desc: 'Número de semana' },
  { token: '{material_titulo}', desc: 'Título del material (Plantilla)' },
  { token: '{fecha_generacion}', desc: 'Fecha actual en formato local' },
  { token: '{institucion_nombre}', desc: 'Nombre del Tenant/Ciclo' },
  { token: '{ciclo_nombre}', desc: 'Nombre del Ciclo seleccionado' }
]
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full">
    <!-- Form (Left Column) -->
    <form @submit.prevent="handleSubmit"
      class="lg:col-span-6 flex flex-col h-full max-h-full overflow-y-auto pr-2 custom-scrollbar">

      <!-- Group: Configuración General -->
      <details open
        class="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm group">
        <summary
          class="sticky top-0 z-10 cursor-pointer rounded-xl group-open:rounded-b-none bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm px-5 py-3 border-b border-transparent group-open:border-slate-200 dark:group-open:border-white/5 flex items-center gap-2 list-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <UIcon name="i-heroicons-document-text" class="text-indigo-500 w-5 h-5" />
          <h3 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">Configuración General</h3>
          <UIcon name="i-heroicons-chevron-down"
            class="ml-auto w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
        </summary>
        <div class="p-5 grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">

          <!-- Left Col: Basics -->
          <div class="flex flex-col gap-5">
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Nombre de la
                Plantilla</label>
              <UInput v-model="form.name" placeholder="Ej. Diseño Premium 2026" required size="lg" />
            </div>
            <UCheckbox v-model="form.isDefault" label="Establecer como diseño predeterminado global" />
          </div>

          <!-- Right Col: Cover & Watermark -->
          <div
            class="flex flex-col gap-5 bg-slate-50/50 dark:bg-slate-800/20 p-4 rounded-lg border border-slate-100 dark:border-white/5">
            <!-- Cover Section -->
            <div class="flex flex-col gap-3">
              <UCheckbox v-model="form.showCover" label="Generar Portada (Cover Page)" />

              <div v-if="form.showCover" class="pl-7 flex items-center gap-3">
                <div v-if="coverPreview"
                  class="h-14 w-10 flex items-center justify-center bg-white dark:bg-slate-950 rounded shadow-sm border border-slate-200 dark:border-white/10 overflow-hidden shrink-0">
                  <img :src="coverPreview" class="max-h-full max-w-full object-cover" />
                </div>
                <div class="flex gap-2">
                  <UButton color="neutral" variant="outline" size="xs" icon="i-heroicons-photo"
                    @click="($refs.coverInput as any)?.click()">Subir</UButton>
                  <input ref="coverInput" type="file" accept="image/png,image/jpeg" class="hidden"
                    @change="onCoverChange" />
                  <UButton v-if="coverPreview" color="error" variant="ghost" size="xs" icon="i-heroicons-trash"
                    @click="removeCover" />
                </div>
              </div>
            </div>

            <!-- Separator -->
            <hr class="border-slate-200 dark:border-white/10" />

            <!-- Watermark Section -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Marca de
                Agua
                (Fondo global)</label>
              <div class="flex items-center gap-3">
                <div v-if="watermarkPreview"
                  class="h-12 w-12 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-white/5 overflow-hidden shrink-0">
                  <img :src="watermarkPreview" class="max-h-full max-w-full object-contain" />
                </div>
                <div class="flex gap-2">
                  <UButton color="neutral" variant="outline" size="xs" icon="i-heroicons-photo"
                    @click="($refs.watermarkInput as any)?.click()">Subir</UButton>
                  <input ref="watermarkInput" type="file" accept="image/png,image/jpeg" class="hidden"
                    @change="onWatermarkChange" />
                  <UButton v-if="watermarkPreview" color="error" variant="ghost" size="xs" icon="i-heroicons-trash"
                    @click="removeWatermark" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </details>

      <!-- Group: Encabezado y Pie de Página -->
      <details
        class="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm group">
        <summary
          class="sticky top-0 z-10 cursor-pointer rounded-xl group-open:rounded-b-none bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm px-5 py-3 border-b border-transparent group-open:border-slate-200 dark:group-open:border-white/5 flex items-center gap-2 list-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <UIcon name="i-heroicons-bars-3-bottom-left" class="text-indigo-500 w-5 h-5" />
          <h3 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">Encabezado y Pie de Página</h3>
          <UIcon name="i-heroicons-chevron-down"
            class="ml-auto w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
        </summary>
        <div class="p-5 space-y-6">

          <!-- Banner Superior -->
          <div>
            <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Fondo Superior
              (Banner)</label>
            <div class="flex items-center gap-3">
              <div v-if="bannerPreview"
                class="h-10 w-24 flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-white/5 overflow-hidden shrink-0">
                <img :src="bannerPreview" class="max-h-full max-w-full object-cover" />
              </div>
              <div class="flex gap-2">
                <UButton color="neutral" variant="outline" size="xs" icon="i-heroicons-photo"
                  @click="($refs.bannerInput as any)?.click()">
                  Subir</UButton>
                <input ref="bannerInput" type="file" accept="image/png,image/jpeg" class="hidden"
                  @change="onBannerChange" />
                <UButton v-if="bannerPreview" color="error" variant="ghost" size="xs" icon="i-heroicons-trash"
                  @click="removeBanner" />
              </div>
            </div>
          </div>

          <!-- Helper Variables (Compact Reference) -->
          <details
            class="border border-slate-200 dark:border-white/10 rounded-lg overflow-hidden text-sm group">
            <summary
              class="cursor-pointer group-open:rounded-b-none bg-slate-50/80 dark:bg-slate-800/80 px-3 py-2 border-b border-transparent group-open:border-slate-200 dark:group-open:border-white/10 flex items-center gap-2 list-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors text-xs font-semibold text-slate-600 dark:text-slate-300">
              <UIcon name="i-heroicons-code-bracket" class="w-4 h-4 text-indigo-500 shrink-0" />
              <span>Variables Dinámicas</span>
              <UIcon name="i-heroicons-chevron-down"
                class="ml-auto w-4 h-4 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
            </summary>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 p-3 bg-white dark:bg-slate-900">
              <div v-for="v in variablesHelper" :key="v.token"
                class="flex items-center justify-between gap-2 text-[11px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 p-1 rounded transition-colors group/var-item"
                @click="copyToClipboard(v.token)" title="Click para copiar">
                <div class="flex items-center gap-2 truncate pointer-events-none">
                  <code
                    class="text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded">{{
                      v.token }}</code>
                  <span class="text-slate-500 dark:text-slate-400 truncate" :title="v.desc">{{ v.desc }}</span>
                </div>
                <UIcon name="i-heroicons-document-duplicate"
                  class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 opacity-40 group-hover/var-item:opacity-100 transition-opacity shrink-0" />
              </div>
            </div>
          </details>

          <!-- Header Grid -->
          <div class="dark:bg-slate-800/30 p-4 rounded-lg border border-slate-200 dark:border-white/5 transition-all"
            @mouseenter="setFocus('header')" @mouseleave="setFocus(null)">
            <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Zonas de Encabezado
              (Header)</label>
            <div class="grid grid-cols-3 gap-3">
              <div v-for="pos in ['left', 'center', 'right']" :key="'header-' + pos" class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                  <label class="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold">
                    {{ pos === 'left' ? 'Izquierda' : pos === 'center' ? 'Centro' : 'Derecha' }}
                  </label>
                  <div
                    class="flex bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/50 dark:border-white/5 shadow-inner">
                    <button type="button" @click="gridModes.header[pos as 'left' | 'center' | 'right'] = 'text'" :class="[
                      gridModes.header[pos as 'left' | 'center' | 'right'] === 'text'
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    ]" class="px-2 py-0.5 rounded-md transition-all duration-200 flex items-center justify-center"
                      title="Insertar Texto">
                      <UIcon name="i-lucide-type" class="w-3.5 h-3.5" />
                    </button>
                    <button type="button" @click="gridModes.header[pos as 'left' | 'center' | 'right'] = 'image'"
                      :class="[
                        gridModes.header[pos as 'left' | 'center' | 'right'] === 'image'
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      ]" class="px-2 py-0.5 rounded-md transition-all duration-200 flex items-center justify-center"
                      title="Insertar Imagen">
                      <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <template v-if="gridModes.header[pos as 'left' | 'center' | 'right'] === 'text'">
                  <div class="relative">
                    <RichTextInput v-model="(form.headerConfig as any)[pos]" placeholder="Texto o variables"
                      collapsibleToolbar />
                    <UPopover mode="click" :popper="{ placement: 'bottom-end' }">
                      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-code-bracket"
                        class="absolute right-1.5 bottom-1.5 opacity-40 hover:opacity-100 transition-opacity z-10 rounded-md bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 shadow-sm"
                        title="Insertar variable" />
                      <template #content>
                        <div class="w-56 p-2 space-y-1">
                          <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-2 pt-1 pb-1.5 border-b border-slate-100 dark:border-white/5">
                            Variables disponibles
                          </p>
                          <button v-for="v in variablesHelper" :key="v.token" type="button"
                            class="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            @click="copyToClipboard(v.token)">
                            <code class="text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded text-[10px] shrink-0">{{ v.token }}</code>
                            <span class="text-slate-500 dark:text-slate-400 truncate">{{ v.desc }}</span>
                          </button>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </template>

                <template v-else>
                  <div
                    class="flex items-center gap-2 border border-slate-200 dark:border-white/10 p-2 rounded bg-white dark:bg-slate-900 mt-1">
                    <div v-if="isImageUrl((form.headerConfig as any)[pos])"
                      class="h-8 w-12 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 rounded overflow-hidden">
                      <img :src="(form.headerConfig as any)[pos]" class="max-h-full max-w-full object-contain" />
                    </div>
                    <div class="flex flex-col gap-1 flex-1">
                      <UButton size="xs" variant="outline" color="neutral" icon="i-heroicons-photo"
                        @click="($refs['headerImg_' + pos] as any)?.[0]?.click()">Subir</UButton>
                      <input :ref="'headerImg_' + pos" type="file" accept="image/*" class="hidden"
                        @change="e => onGridImageChange(e, 'header', pos as any)" />
                      <UButton v-if="isImageUrl((form.headerConfig as any)[pos])" size="xs" variant="ghost"
                        color="error" icon="i-heroicons-trash" @click="() => clearGridSlot('header', pos as 'left' | 'center' | 'right')">Borrar
                      </UButton>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <!-- Footer Grid -->
          <div class="dark:bg-slate-800/30 p-4 rounded-lg border border-slate-100 dark:border-white/5 transition-all"
            @mouseenter="setFocus('footer')" @mouseleave="setFocus(null)">
            <label class="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5 uppercase tracking-wide">Zonas de Pie de Página
              (Footer)</label>
            <div class="grid grid-cols-3 gap-3">
              <div v-for="pos in ['left', 'center', 'right']" :key="'footer-' + pos" class="flex flex-col gap-2">
                <div class="flex justify-between items-center">
                  <label class="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-semibold">
                    {{ pos === 'left' ? 'Izquierda' : pos === 'center' ? 'Centro' : 'Derecha' }}
                  </label>
                  <div
                    class="flex bg-slate-200/60 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200/50 dark:border-white/5 shadow-inner">
                    <button type="button" @click="gridModes.footer[pos as 'left' | 'center' | 'right'] = 'text'" :class="[
                      gridModes.footer[pos as 'left' | 'center' | 'right'] === 'text'
                        ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-semibold'
                        : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                    ]" class="px-2 py-0.5 rounded-md transition-all duration-200 flex items-center justify-center"
                      title="Insertar Texto">
                      <UIcon name="i-lucide-type" class="w-3.5 h-3.5" />
                    </button>
                    <button type="button" @click="gridModes.footer[pos as 'left' | 'center' | 'right'] = 'image'"
                      :class="[
                        gridModes.footer[pos as 'left' | 'center' | 'right'] === 'image'
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400 font-semibold'
                          : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                      ]" class="px-2 py-0.5 rounded-md transition-all duration-200 flex items-center justify-center"
                      title="Insertar Imagen">
                      <UIcon name="i-heroicons-photo" class="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <template v-if="gridModes.footer[pos as 'left' | 'center' | 'right'] === 'text'">
                  <div class="relative">
                    <RichTextInput v-model="(form.footerConfig as any)[pos]" placeholder="Texto o variables"
                      collapsibleToolbar />
                    <UPopover mode="click" :popper="{ placement: 'bottom-end' }">
                      <UButton size="xs" variant="ghost" color="neutral" icon="i-heroicons-code-bracket"
                        class="absolute right-1.5 bottom-1.5 opacity-40 hover:opacity-100 transition-opacity z-10 rounded-md bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-white/10 shadow-sm"
                        title="Insertar variable" />
                      <template #content>
                        <div class="w-56 p-2 space-y-1">
                          <p class="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide px-2 pt-1 pb-1.5 border-b border-slate-100 dark:border-white/5">
                            Variables disponibles
                          </p>
                          <button v-for="v in variablesHelper" :key="v.token" type="button"
                            class="w-full flex items-center gap-2 px-2 py-1.5 text-[11px] text-left rounded hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            @click="copyToClipboard(v.token)">
                            <code class="text-indigo-600 dark:text-indigo-400 font-mono bg-indigo-50 dark:bg-indigo-900/30 px-1 py-0.5 rounded text-[10px] shrink-0">{{ v.token }}</code>
                            <span class="text-slate-500 dark:text-slate-400 truncate">{{ v.desc }}</span>
                          </button>
                        </div>
                      </template>
                    </UPopover>
                  </div>
                </template>

                <template v-else>
                  <div
                    class="flex items-center gap-2 border border-slate-200 dark:border-white/10 p-2 rounded bg-white dark:bg-slate-900 mt-1">
                    <div v-if="isImageUrl((form.footerConfig as any)[pos])"
                      class="h-8 w-12 bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 rounded overflow-hidden">
                      <img :src="(form.footerConfig as any)[pos]" class="max-h-full max-w-full object-contain" />
                    </div>
                    <div class="flex flex-col gap-1 flex-1">
                      <UButton size="xs" variant="outline" color="neutral" icon="i-heroicons-photo"
                        @click="($refs['footerImg_' + pos] as any)?.[0]?.click()">Subir</UButton>
                      <input :ref="'footerImg_' + pos" type="file" accept="image/*" class="hidden"
                        @change="e => onGridImageChange(e, 'footer', pos as any)" />
                      <UButton v-if="isImageUrl((form.footerConfig as any)[pos])" size="xs" variant="ghost"
                        color="error" icon="i-heroicons-trash" @click="() => clearGridSlot('footer', pos as 'left' | 'center' | 'right')">Borrar
                      </UButton>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </details>


      <!-- Group: Estilo del Contenido -->
      <details
        class="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm group">
        <summary
          class="sticky top-0 z-10 cursor-pointer rounded-xl group-open:rounded-b-none bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm px-5 py-3 border-b border-transparent group-open:border-slate-200 dark:group-open:border-white/5 flex items-center gap-2 list-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <UIcon name="i-heroicons-paint-brush" class="text-indigo-500 w-5 h-5" />
          <h3 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">Estilo del Contenido (Preguntas)</h3>
          <UIcon name="i-heroicons-chevron-down"
            class="ml-auto w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
        </summary>
        <div class="p-4">
          <div
            class="border border-slate-200 dark:border-white/10 rounded-md overflow-hidden bg-white dark:bg-slate-900 shadow-sm">

            <!-- Toolbar Fila Única -->
            <div
              class="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-2 p-1.5 px-2">

              <!-- Font Family -->
              <div title="Tipografía del Contenido" class="relative flex items-center">
                <select v-model="form.fontFamily"
                  class="text-[11px] py-1 px-2 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded cursor-pointer outline-none focus:ring-1 focus:ring-primary">
                  <option value="Arial" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Arial
                  </option>
                  <option value="Courier New" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                    Courier
                  </option>
                  <option value="Georgia" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Georgia
                  </option>
                  <option value="Times New Roman" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">
                    Times
                  </option>
                  <option value="Verdana" class="bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100">Verdana
                  </option>
                </select>
              </div>

              <!-- Font Size -->
              <div title="Tamaño de Letra (pt)"
                class="relative flex items-center bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded overflow-hidden focus-within:ring-1 focus-within:ring-primary w-20">
                <input type="number" v-model="contentFontSizeNum" min="6" max="36"
                  class="w-full text-[11px] py-1 px-2 bg-transparent outline-none text-center text-slate-800 dark:text-slate-100" />
                <span
                  class="text-[9px] text-slate-400 dark:text-slate-500 pr-2 pointer-events-none font-medium">pt</span>
              </div>

              <div class="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1"></div>

              <!-- Text Color -->
              <div title="Color de Texto Base"
                class="flex items-center gap-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 p-1 rounded transition-colors cursor-pointer relative">
                <div
                  class="relative w-5 h-5 rounded overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0">
                  <input type="color" v-model="form.contentTextColor"
                    class="absolute inset-0 w-8 h-8 -top-1 -left-1 cursor-pointer" />
                </div>
                <span class="text-[10px] font-semibold text-slate-600 dark:text-slate-300 uppercase">Texto</span>
              </div>

              <div class="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1"></div>

              <!-- Accent Color -->
              <div title="Color de Acentos (Números y Letras)"
                class="flex items-center gap-1.5 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 p-1 rounded transition-colors cursor-pointer relative">
                <div
                  class="relative w-5 h-5 rounded overflow-hidden border border-slate-300 dark:border-slate-600 shrink-0">
                  <input type="color" v-model="accentColorHex"
                    class="absolute inset-0 w-8 h-8 -top-1 -left-1 cursor-pointer" />
                </div>
                <span class="text-[10px] font-semibold text-slate-600 dark:text-slate-300 uppercase">Acentos</span>
              </div>
            </div>

            <!-- Previsualización Falsa -->
            <div class="p-6 bg-white overflow-hidden relative border-t border-slate-100 dark:border-white/5">
              <div class="flex gap-2" :style="{ fontFamily: form.fontFamily, fontSize: form.contentFontSize }">
                <span class="font-bold shrink-0" :style="{ color: accentColorHex }">1.</span>
                <div :style="{ color: form.contentTextColor }">
                  <p class="m-0 leading-snug">¿Cuál es el principal objetivo del diseño de plantillas en Odiseo?</p>
                  <div class="mt-2 space-y-1 pl-1">
                    <div class="flex gap-2"><span class="font-bold" :style="{ color: accentColorHex }">A)</span>
                      <span>Reducir
                        la eficiencia.</span>
                    </div>
                    <div class="flex gap-2"><span class="font-bold" :style="{ color: accentColorHex }">B)</span>
                      <span>Mejorar
                        la presentación y estandarización.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </details>

      <!-- Group: Márgenes y Modo Imprenta -->
      <details
        class="mb-6 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm group">
        <summary
          class="sticky top-0 z-10 cursor-pointer rounded-xl group-open:rounded-b-none bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm px-5 py-3 border-b border-transparent group-open:border-slate-200 dark:group-open:border-white/5 flex items-center gap-2 list-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors">
          <UIcon name="i-heroicons-document-duplicate" class="text-indigo-500 w-5 h-5" />
          <h3 class="font-semibold text-slate-800 dark:text-slate-200 text-sm">Márgenes y Modo Imprenta</h3>
          <UIcon name="i-heroicons-chevron-down"
            class="ml-auto w-5 h-5 text-slate-400 group-open:rotate-180 transition-transform duration-200" />
        </summary>
        <div class="p-5 space-y-5">
          <div
            class="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-lg border border-indigo-100 dark:border-indigo-500/20">
            <UCheckbox v-model="form.isBookMode" label="Activar Modo Imprenta (Márgenes Espejados)"
              class="font-medium text-indigo-900 dark:text-indigo-200" />
            <p class="text-[11px] text-indigo-600/70 dark:text-indigo-300/70 mt-1 ml-6 leading-relaxed">
              Ideal para impresión a doble cara. El margen interior y exterior se invierten automáticamente en páginas
              pares e impares, permitiendo espacio para la encuadernación.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label
                class="block text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wide">Superior</label>
              <UInput type="number" step="0.1" min="2" max="6" v-model="marginNumTop" icon="i-heroicons-arrow-up">
                <template #trailing><span class="text-xs text-slate-400">cm</span></template>
              </UInput>
            </div>
            <div>
              <label
                class="block text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wide">Inferior</label>
              <UInput type="number" step="0.1" min="1.5" max="5" v-model="marginNumBottom"
                icon="i-heroicons-arrow-down">
                <template #trailing><span class="text-xs text-slate-400">cm</span></template>
              </UInput>
            </div>
            <div>
              <label
                class="block text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wide">Interior
                (Lomo)</label>
              <UInput type="number" step="0.1" min="1" max="4" v-model="marginNumInside"
                icon="i-heroicons-arrows-right-left">
                <template #trailing><span class="text-xs text-slate-400">cm</span></template>
              </UInput>
            </div>
            <div>
              <label
                class="block text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1 uppercase tracking-wide">Exterior</label>
              <UInput type="number" step="0.1" min="1" max="4" v-model="marginNumOutside"
                icon="i-heroicons-arrows-left-right">
                <template #trailing><span class="text-xs text-slate-400">cm</span></template>
              </UInput>
            </div>
          </div>
        </div>
      </details>

    </form>

    <!-- Live Preview (Right Column) -->
    <div
      class="lg:sticky lg:top-4 h-[calc(100vh-2rem)] max-h-[85vh] flex flex-col lg:col-span-6 bg-slate-100/50 dark:bg-slate-900/80 p-0 rounded-2xl border border-slate-200/60 dark:border-white/10 shadow-lg overflow-hidden backdrop-blur-xl">
      <!-- Toolbar of the Preview -->
      <div
        class="bg-white/80 dark:bg-slate-800/80 backdrop-blur-md px-4 py-3 border-b border-slate-200/60 dark:border-white/10 flex items-center justify-between shrink-0 w-full overflow-hidden gap-3">

        <div class="flex items-center gap-2 min-w-0">
          <label
            class="flex items-center gap-2 text-xs font-semibold tracking-wide text-slate-600 dark:text-slate-300 uppercase truncate">
            <UIcon name="i-heroicons-computer-desktop" class="w-4 h-4 text-indigo-500 shrink-0" />
            <span class="hidden sm:inline">Previsualización Dinámica</span>
            <span class="sm:hidden">Previsualización</span>
          </label>

          <span v-if="loadingPreview"
            class="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-500/20 rounded-full shadow-sm shrink-0 ml-1">
            <UIcon name="i-heroicons-arrow-path" class="w-3.5 h-3.5 animate-spin" /> <span
              class="hidden md:inline">Sincronizando...</span>
          </span>
        </div>

        <!-- Toolbar for Zoom Controls -->
        <div
          class="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 px-1 py-1 rounded-md border border-slate-200 dark:border-white/5 shrink-0 shadow-sm">
          <UButton color="neutral" variant="ghost" icon="i-heroicons-minus" size="xs" @click="zoomOut"
            :disabled="zoom <= 40" />
          <span class="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 w-9 text-center">{{ zoom
          }}%</span>
          <UButton color="neutral" variant="ghost" icon="i-heroicons-plus" size="xs" @click="zoomIn"
            :disabled="zoom >= 150" />
          <div class="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5"></div>
          <UButton color="neutral" variant="ghost" size="xs" class="text-[10px] font-semibold tracking-wide"
            @click="resetZoom">Ajustar</UButton>
        </div>

        <!-- Action Controls -->
        <div class="flex items-center gap-2 shrink-0">
          <UButton color="neutral" variant="ghost" size="xs" @click="emit('cancelled')">Cancelar</UButton>
          <UButton color="primary" :loading="submitting" size="xs" @click="handleSubmit">
            {{ isEditing ? 'Guardar Cambios' : 'Crear Plantilla' }}
          </UButton>
        </div>
      </div>
      <!-- Canvas Area -->
      <div class="flex-1 bg-slate-300/40 dark:bg-[#0f111a] relative overflow-auto rounded-b-2xl p-6 lg:p-10">
        <PdfDesignPreview :html="previewHtml" :loading="loadingPreview" :zoom="zoom" class="w-full" />
      </div>
    </div>
  </div>
</template>

<style scoped>
details>summary::-webkit-details-marker {
  display: none;
}

details>summary {
  list-style: none;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(203 213 225);
  border-radius: 999px;
}

html.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgb(51 65 85);
}
</style>
