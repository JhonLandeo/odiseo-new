<template>
  <div class="w-full space-y-6">


    <!-- 2. Barra de Control y Búsqueda Premium (Sticky Floating Card) -->
    <div class="sticky top-[8.5rem] z-20 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-[#2b2b3f] border border-slate-200 dark:border-slate-700/50 p-4 rounded-2xl shadow-md transition-all">
      <!-- Buscador -->
      <div class="flex-1 max-w-md relative">
        <UInput
          v-model="localSearch"
          placeholder="Buscar cursos, temas o subtemas..."
          icon="i-heroicons-magnifying-glass"
          size="md"
          color="gray"
          variant="outline"
          class="w-full"
          id="catalog-search-input"
          :ui="{ icon: { trailing: { pointer: '' } } }"
        >
          <template #trailing>
            <div class="hidden sm:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-mono select-none">
              /
            </div>
          </template>
        </UInput>
      </div>

      <!-- Filtros de Estado y Acciones Globales -->
      <div class="flex flex-wrap items-center gap-3">
        <!-- Selector Segmentado -->
        <div class="flex bg-slate-100 dark:bg-[#1e1e2d] p-1 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
          <button
            v-for="opt in statusOptions"
            :key="opt.value"
            @click="filterStatus = opt.value"
            class="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200"
            :class="filterStatus === opt.value
              ? 'bg-white dark:bg-[#2b2b3f] text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'"
          >
            {{ opt.label }}
          </button>
        </div>

        <!-- Acciones Rápidas -->
        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          class="btn-premium-secondary"
          icon="i-heroicons-arrows-pointing-out"
          @click="toggleAllCourses"
        >
          {{ isAllCoursesExpanded ? 'Colapsar Cursos' : 'Expandir Cursos' }}
        </UButton>

        <UButton
          size="sm"
          color="gray"
          variant="ghost"
          class="btn-premium-secondary"
          :icon="isAllSubtopicsExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          @click="toggleAllSubtopics"
        >
          {{ isAllSubtopicsExpanded ? 'Colapsar Subtemas' : 'Ver Subtemas' }}
        </UButton>
      </div>
    </div>

    <!-- 3. Lista de Cursos (Tarjetas Tipo Acordeón) -->
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <div v-if="filteredCourses.length === 0" class="col-span-full py-16 text-center bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50">
        <UIcon name="i-heroicons-inbox" class="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
        <p class="text-sm text-slate-500 dark:text-slate-400">No se encontraron cursos con "{{ localSearch }}"</p>
      </div>

      <div
        v-else
        v-for="course in filteredCourses"
        :key="course.id"
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden transition-all duration-200"
        :class="expanded.has(course.id) ? 'ring-1 ring-indigo-500/20 border-indigo-500/30' : 'hover:border-slate-300 dark:hover:border-slate-600 hover:shadow-md'"
      >
        <!-- Cabecera de Curso (Clickable) -->
        <button
          @click="toggleCourse(course.id)"
          class="w-full flex items-center justify-between px-6 py-4 bg-slate-50/50 dark:bg-[#1e1e2d]/30 hover:bg-slate-50 dark:hover:bg-[#1e1e2d]/50 transition-colors outline-none text-left"
        >
          <div class="flex items-center gap-4">
            <!-- Icono Temático del Curso -->
            <div 
              class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 shadow-sm"
              :class="getCourseDesign(course.name).colorClass"
            >
              <UIcon :name="getCourseDesign(course.name).icon" class="w-5 h-5" />
            </div>
            <div>
              <h3 class="text-base font-bold text-slate-800 dark:text-slate-200">{{ course.name }}</h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                <span class="font-medium text-slate-700 dark:text-slate-300">{{ course.activeTopicsCount || 0 }}</span> visibles de <span class="font-medium text-slate-700 dark:text-slate-300">{{ course.topicsCount || 0 }}</span> temas
              </p>
            </div>
          </div>
          
          <div class="flex items-center gap-4">
            <!-- Barra de Progreso del Curso -->
            <div v-if="course.topicsCount && course.topicsCount > 0" class="hidden sm:flex items-center gap-2 mr-2">
              <div class="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  class="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full" 
                  :style="{ width: `${((course.activeTopicsCount || 0) / course.topicsCount) * 100}%` }"
                ></div>
              </div>
              <span class="text-[10px] text-slate-400 font-semibold w-8 text-right">
                {{ Math.round(((course.activeTopicsCount || 0) / course.topicsCount) * 100) }}%
              </span>
            </div>

            <!-- Flecha de Despliegue -->
            <div class="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-[#36364e] text-slate-500 dark:text-slate-400 transition-transform duration-300"
                 :class="expanded.has(course.id) ? 'rotate-180 bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : ''">
              <UIcon name="i-heroicons-chevron-down" class="w-5 h-5" />
            </div>
          </div>
        </button>

        <!-- Listado de Temas (Desplegado) -->
        <div v-if="expanded.has(course.id)" class="border-t border-slate-100 dark:border-slate-700/50">
          <!-- Skeleton Loader al Cargar Temas -->
          <div v-if="loadingCourses.has(course.id)" class="p-6 space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <USkeleton class="h-24 w-full dark:bg-slate-800 rounded-2xl animate-pulse" v-for="i in 4" :key="i" />
            </div>
          </div>
          
          <!-- Cuadrícula de Temas -->
          <div v-else class="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              v-for="topic in filteredTopics(course)"
              :key="topic.id"
              @click="toggleSubtopic(topic.id)"
              class="flex flex-col p-4 rounded-2xl border transition-all duration-200 group cursor-pointer select-none relative"
              :class="[
                topic.isActive 
                  ? 'bg-white dark:bg-[#36364e]/30 border-slate-200 dark:border-slate-700 hover:border-indigo-500/30 dark:hover:border-indigo-500/30 hover:shadow-md' 
                  : 'bg-slate-50/50 dark:bg-[#1e1e2d]/20 border-dashed border-slate-200 dark:border-slate-700/60 opacity-70 hover:opacity-90 bg-[linear-gradient(45deg,rgba(148,163,184,0.03)_25%,transparent_25%,transparent_50%,rgba(148,163,184,0.03)_50%,rgba(148,163,184,0.03)_75%,transparent_75%,transparent)] bg-[length:16px_16px]',
                { 'opacity-50 pointer-events-none': pendingTopics.has(topic.id) }
              ]"
            >
              <!-- Cabecera de Tema: Nombre y Botón de Ocultar -->
              <div class="flex items-start justify-between gap-3 w-full">
                <h4 
                  class="text-sm font-bold flex-1 min-w-0 tracking-tight transition-colors duration-150"
                  :title="topic.name" 
                  :class="topic.isActive ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500 line-through'"
                >
                  {{ topic.name }}
                </h4>
                
                <div class="shrink-0 flex items-center" @click.stop>
                  <!-- Botón Ojo Visible pero Sutil -->
                  <UButton
                    size="xs"
                    color="gray"
                    variant="ghost"
                    :icon="topic.isActive ? 'i-heroicons-eye' : 'i-heroicons-eye-slash'"
                    class="btn-premium-secondary transition-all hover:scale-105"
                    :class="topic.isActive 
                      ? 'bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-100/30 dark:border-emerald-500/20' 
                      : 'text-slate-400 dark:text-slate-500'"
                    :title="topic.isActive ? 'Ocultar tema en el catálogo' : 'Mostrar tema en el catálogo'"
                    @click="onToggleActive(topic)"
                  >
                    <span v-if="!topic.isActive" class="text-[10px] ml-1">Oculto</span>
                  </UButton>
                </div>
              </div>
              
              <!-- Información de Subtemas (Footer de la Tarjeta) -->
              <div class="flex items-center justify-between mt-3 text-xs font-semibold text-slate-400 dark:text-slate-500">
                <div class="flex items-center gap-1.5">
                  <UIcon 
                    :name="expandedSubtopics.has(topic.id) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'" 
                    class="w-3.5 h-3.5 transition-transform duration-200" 
                  />
                  <span>
                    {{ topic.subtopics && topic.subtopics.length > 0 ? `${topic.subtopics.length} subtemas` : 'Sin subtemas' }}
                  </span>
                </div>
                <span class="text-[10px] text-indigo-500/80 font-bold group-hover:translate-x-0.5 transition-transform duration-200">
                  {{ expandedSubtopics.has(topic.id) ? 'Cerrar' : 'Ver detalle' }}
                </span>
              </div>
              
              <!-- Lista de Subtemas (Colapsable en pills compactos) -->
              <transition name="expand">
                <div v-show="expandedSubtopics.has(topic.id)" class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 w-full" @click.stop>
                  <div v-if="topic.subtopics && topic.subtopics.length > 0" class="flex flex-wrap gap-1.5">
                    <div 
                      v-for="sub in topic.subtopics" 
                      :key="sub.id" 
                      class="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-200/50 dark:border-slate-700/60 flex items-center gap-1 transition-all hover:bg-indigo-50/50 dark:hover:bg-indigo-950/20"
                      :class="topic.isActive ? 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700' : 'text-slate-400 dark:text-slate-600 line-through'"
                    >
                      <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="topic.isActive ? 'bg-indigo-400 dark:bg-indigo-500' : 'bg-slate-300 dark:bg-slate-700'" />
                      <span>{{ sub.name }}</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-slate-400 dark:text-slate-500 italic py-1">
                    No se han registrado subtemas para este tema.
                  </div>
                </div>
              </transition>
            </div>
            
            <div v-if="filteredTopics(course).length === 0" class="col-span-full py-8 text-center text-slate-400 dark:text-slate-500 text-sm">
              No hay temas que coincidan con la búsqueda.
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useCatalogsStore } from '../store'
import type { CatalogCourse, CatalogTopic } from '../types'
import { watchDebounced } from '@vueuse/core'

const store = useCatalogsStore()
const toast = useToast()

const localSearch = ref('')
const filterStatus = ref('all')
const pendingTopics = ref(new Set<string>())
const loadingCourses = ref(new Set<string>())
const expanded = ref(new Set<string>())
const expandedSubtopics = ref(new Set<string>())

// Búsqueda en servidor con debounce
watchDebounced(localSearch, (val) => {
  store.fetchCourses(val)
}, { debounce: 400 })

const statusOptions = [
  { label: 'Todos', value: 'all' },
  { label: 'Visibles', value: 'active' },
  { label: 'Ocultos', value: 'inactive' },
]


const filteredCourses = computed(() => {
  return store.courses
    .map(course => ({
      ...course,
      topics: (course.topics || []).filter(t => {
        const matchStatus = filterStatus.value === 'all' ||
          (filterStatus.value === 'active' ? t.isActive : !t.isActive)
        return matchStatus
      })
    }))
    .filter(course => {
      if (filterStatus.value === 'all') return true
      if (course.topics.length > 0) return course.topics.length > 0
      // Para cursos no expandidos, usar los counts del backend como heurística
      const count =
        filterStatus.value === 'active'
          ? course.activeTopicsCount || 0
          : (course.topicsCount || 0) - (course.activeTopicsCount || 0)
      return count > 0
    })
})

function filteredTopics(course: CatalogCourse) {
  return course.topics || []
}

// Acciones Globales
const isAllCoursesExpanded = computed(() => {
  if (filteredCourses.value.length === 0) return false
  return filteredCourses.value.every(c => expanded.value.has(c.id))
})

async function toggleAllCourses() {
  if (isAllCoursesExpanded.value) {
    expanded.value.clear()
  } else {
    const promises = []
    for (const c of filteredCourses.value) {
      expanded.value.add(c.id)
      if (c.topics.length === 0 && (c.topicsCount || 0) > 0) {
        loadingCourses.value.add(c.id)
        promises.push(
          store.fetchCourseTopics(c.id).finally(() => {
            loadingCourses.value.delete(c.id)
          })
        )
      }
    }
    if (promises.length > 0) {
      await Promise.all(promises)
    }
  }
}

const isAllSubtopicsExpanded = computed(() => {
  const loadedTopics = store.courses.flatMap(c => c.topics || [])
  if (loadedTopics.length === 0) return false
  return loadedTopics.every(t => expandedSubtopics.value.has(t.id))
})

function toggleAllSubtopics() {
  const loadedTopics = store.courses.flatMap(c => c.topics || [])
  if (isAllSubtopicsExpanded.value) {
    expandedSubtopics.value.clear()
  } else {
    loadedTopics.forEach(t => expandedSubtopics.value.add(t.id))
  }
}

// Acciones Individuales
async function toggleCourse(id: string) {
  if (expanded.value.has(id)) {
    expanded.value.delete(id)
  } else {
    expanded.value.add(id)
    const course = store.courses.find(c => c.id === id)
    if (course && course.topics.length === 0 && (course.topicsCount || 0) > 0) {
      loadingCourses.value.add(id)
      await store.fetchCourseTopics(id)
      loadingCourses.value.delete(id)
    }
  }
}

function toggleSubtopic(topicId: string) {
  if (expandedSubtopics.value.has(topicId)) {
    expandedSubtopics.value.delete(topicId)
  } else {
    expandedSubtopics.value.add(topicId)
  }
}

async function onToggleActive(topic: CatalogTopic) {
  pendingTopics.value.add(topic.id)
  try {
    await store.toggleVisibility(topic.id, !topic.isActive)
  } catch (e: any) {
    toast.add({ title: e.message, color: 'red', duration: 3000 })
  } finally {
    pendingTopics.value.delete(topic.id)
  }
}

// Asignador de colores y avatares según materia
function getCourseDesign(name: string) {
  const normalized = name.toLowerCase()
  if (normalized.includes('matemática') || normalized.includes('álgebra') || normalized.includes('geometría') || normalized.includes('cálculo') || normalized.includes('números')) {
    return {
      icon: 'i-heroicons-calculator',
      colorClass: 'text-blue-500 bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/50',
      badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
    }
  } else if (normalized.includes('lenguaje') || normalized.includes('comunicación') || normalized.includes('literatura') || normalized.includes('inglés') || normalized.includes('redacción')) {
    return {
      icon: 'i-heroicons-language',
      colorClass: 'text-amber-500 bg-amber-50 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/50',
      badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
    }
  } else if (normalized.includes('historia') || normalized.includes('geografía') || normalized.includes('filosofía') || normalized.includes('lógica') || normalized.includes('cívica') || normalized.includes('sociales')) {
    return {
      icon: 'i-heroicons-globe-americas',
      colorClass: 'text-violet-500 bg-violet-50 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/50',
      badgeClass: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300'
    }
  } else if (normalized.includes('física') || normalized.includes('química') || normalized.includes('biología') || normalized.includes('ciencia') || normalized.includes('cta')) {
    return {
      icon: 'i-heroicons-beaker',
      colorClass: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/50',
      badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
    }
  }
  return {
    icon: 'i-heroicons-folder',
    colorClass: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-100 dark:border-indigo-900/50',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
  }
}

// Exponer para la página padre (index.vue)
defineExpose({
  focusSearch() {
    const input = document.getElementById('catalog-search-input')
    if (input) input.focus()
  }
})
</script>

<style scoped>
.expand-enter-active,
.expand-leave-active {
  transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  max-height: 400px;
  opacity: 1;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  max-height: 0;
  opacity: 0;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  margin-top: 0 !important;
  border-top-width: 0 !important;
}
</style>
