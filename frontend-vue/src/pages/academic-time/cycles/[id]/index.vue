<template>
  <div class="px-4 sm:px-6 lg:px-8 py-8 max-w-[90rem] mx-auto min-h-[calc(100vh-64px)] flex flex-col">
    <!-- Breadcrumbs -->
    <nav class="flex items-center text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 shrink-0" aria-label="Breadcrumb">
      <NuxtLink to="/" class="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Inicio</NuxtLink>
      <svg class="w-4 h-4 mx-2 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      <NuxtLink to="/academic-time" class="hover:text-slate-900 dark:hover:text-slate-200 transition-colors">Tiempo Académico</NuxtLink>
      <svg class="w-4 h-4 mx-2 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
      <span class="text-slate-900 dark:text-slate-200 truncate max-w-[200px] font-semibold">{{ cycleName }}</span>
    </nav>

    <!-- Header -->
    <div class="flex items-start justify-between gap-4 mb-6 shrink-0">
      <div>
        <h1 class="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-3">
          {{ cycleName }}
          <span v-if="cycle" class="text-xs px-2 py-1 rounded-md font-medium" :class="cycle.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400'">
            {{ cycle.isActive ? 'Activo' : 'Archivado' }}
          </span>
        </h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">
          {{ cycle ? `${cycle.startDate} → ${cycle.endDate} · ${cycle.totalWeeks} semanas` : 'Cargando...' }}
        </p>
      </div>
      <NuxtLink
        to="/academic-time"
        class="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
      >
        ← Volver a Ciclos
      </NuxtLink>
    </div>

    <!-- Tabs -->
    <div class="flex-1 flex flex-col min-h-0">
      <UTabs :items="tabItems" class="w-full flex flex-col h-full">
        <template #content="{ item }">
          <div class="pt-5 flex flex-col min-h-0 flex-1">

            <!-- ── Pestaña 1: Configuración General ── -->
            <template v-if="item.key === 'general'">
              <div class="bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm ring-1 ring-black/[0.02] p-6 space-y-8">
                <!-- Stats -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div v-for="stat in cycleStats" :key="stat.label" class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                    <div class="text-[11px] text-slate-400 uppercase tracking-wider font-semibold mb-1">{{ stat.label }}</div>
                    <div class="text-slate-800 dark:text-slate-200 font-semibold text-sm">{{ stat.value }}</div>
                  </div>
                </div>

                <!-- Weeks mini-grid -->
                <div v-if="cycle">
                  <h3 class="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">Semanas</h3>
                  <div class="grid grid-cols-4 sm:grid-cols-8 lg:grid-cols-16 gap-2">
                    <div
                      v-for="week in cycle.weeks"
                      :key="week.id"
                      class="flex flex-col items-center justify-center p-3 rounded-xl border text-center"
                      :class="week.isActive
                        ? 'bg-white dark:bg-[#252536] border-slate-200 dark:border-slate-700'
                        : 'bg-slate-50 dark:bg-[#1a1a28] border-slate-200 dark:border-slate-800 opacity-50'"
                    >
                      <span class="text-[10px] font-semibold text-slate-400 uppercase">Sem</span>
                      <span class="text-base font-black mt-0.5" :class="week.isActive ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 line-through'">{{ week.weekNumber }}</span>
                      <span v-if="!week.isActive" class="text-[9px] text-rose-400 font-semibold mt-0.5">Feriado</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>

            <!-- ── Pestaña 2: Plantillas de Material ── -->
            <template v-else-if="item.key === 'materials'">
              <CycleMaterialTemplates :cycleId="cycleId" />
            </template>

            <!-- ── Pestaña 3: Sílabos por Curso ── -->
            <template v-else-if="item.key === 'syllabus'">
              <!-- Active Matrix View -->
              <div v-if="syllabusStore.syllabus" class="space-y-4 flex flex-col min-h-0 h-full">
                <div class="shrink-0">
                  <UButton icon="i-heroicons-arrow-left" color="neutral" variant="ghost" @click="backToSyllabusList">
                    Volver a los cursos
                  </UButton>
                </div>
                <div class="flex-1 overflow-y-auto min-h-0">
                  <SyllabusDistributionMatrix />
                </div>
              </div>

              <!-- Course list filtered by template courses -->
              <div v-else class="bg-white dark:bg-[#1e1e2d] border border-slate-200 dark:border-slate-800/80 rounded-xl shadow-sm overflow-hidden ring-1 ring-black/[0.02]">
                <!-- Header Actions -->
                <div class="px-6 py-4 border-b border-slate-200 dark:border-slate-800/80 flex justify-between items-center bg-slate-50/50 dark:bg-[#1a1a28]/50">
                  <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Gestión de Sílabos</h3>
                  <UButton color="white" variant="solid" icon="i-heroicons-document-duplicate" size="sm" @click="openCycleCloneModal" class="shadow-sm">Clonar desde otro ciclo</UButton>
                </div>
                <!-- Empty state: no templates configured -->
                <div v-if="templateCourseIds.size === 0" class="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div class="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-4">
                    <UIcon name="i-heroicons-exclamation-triangle" class="w-8 h-8 text-amber-400" />
                  </div>
                  <h3 class="text-base font-semibold text-slate-900 dark:text-slate-100">Sin cursos configurados</h3>
                  <p class="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Para gestionar sílabos primero debes configurar al menos una plantilla de material con sus cursos asignados.
                  </p>
                  <button
                    class="mt-6 px-4 py-2 text-sm font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:hover:bg-indigo-500/20 rounded-md transition-colors"
                    @click="goToMaterials"
                  >
                    Ir a Plantillas de Material
                  </button>
                </div>

                <!-- Table filtered by template courseIds -->
                <div v-else class="overflow-x-auto">
                  <table class="min-w-full divide-y divide-slate-200 dark:divide-slate-700/50 text-sm">
                    <thead class="bg-slate-50 dark:bg-[#1e1e2d]/70 sticky top-0">
                      <tr>
                        <th class="px-6 py-4 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] w-5/12">Curso</th>
                        <th class="px-6 py-4 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] w-2/12">Plantillas</th>
                        <th class="px-6 py-4 text-left font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] w-2/12">Estado Sílabo</th>
                        <th class="px-6 py-4 text-right font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] w-3/12">Acciones</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-700/50">
                      <tr v-if="catalogsStore.isLoading || syllabusStore.loading">
                        <td colspan="4" class="px-6 py-10 text-center text-slate-400">
                          <UIcon name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin mx-auto" />
                        </td>
                      </tr>
                      <template v-else>
                        <tr
                          v-for="item in filteredCourseList"
                          :key="item.id"
                          class="hover:bg-slate-50 dark:hover:bg-[#36364e] transition-colors group"
                        >
                          <!-- Course name -->
                          <td class="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                            <div class="flex items-center gap-3">
                              <div class="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                                <UIcon name="i-heroicons-book-open" class="w-4 h-4" />
                              </div>
                              {{ item.name }}
                            </div>
                          </td>
                          <!-- Which templates include this course -->
                          <td class="px-6 py-4">
                            <div class="flex flex-wrap gap-1">
                              <span
                                v-for="tpl in item.templates"
                                :key="tpl.id"
                                class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
                              >
                                {{ tpl.name }}
                              </span>
                            </div>
                          </td>
                          <!-- Syllabus status badge -->
                          <td class="px-6 py-4">
                            <span v-if="item.syllabus && item.syllabus.isActive" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                              ✓ Planificado
                            </span>
                            <span v-else-if="item.syllabus && !item.syllabus.isActive" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                              Archivado
                            </span>
                            <span v-else class="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20">
                              Sin Configurar
                            </span>
                          </td>
                          <!-- Actions -->
                          <td class="px-6 py-4 text-right">
                            <div v-if="item.syllabus" class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <UButton size="sm" :color="item.syllabus.isActive ? 'error' : 'success'" variant="soft"
                                :icon="item.syllabus.isActive ? 'i-heroicons-archive-box-arrow-down' : 'i-heroicons-arrow-path'"
                                @click="syllabusStore.toggleSyllabusVisibility(item.syllabus.id, !item.syllabus.isActive)">
                                {{ item.syllabus.isActive ? 'Archivar' : 'Activar' }}
                              </UButton>
                              <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-document-duplicate" @click="openCloneModal(item.id, item.syllabus)">Clonar</UButton>
                              <UButton size="sm" color="primary" variant="soft" icon="i-heroicons-pencil-square" @click="openSyllabus(item.syllabus)">Editar</UButton>
                            </div>
                            <div v-else class="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <UButton size="sm" color="neutral" variant="ghost" icon="i-heroicons-document-duplicate" @click="openCloneModal(item.id)">Copiar</UButton>
                              <UButton size="sm" color="primary" icon="i-heroicons-plus" @click="openCreate(item.id)">Crear Sílabo</UButton>
                            </div>
                          </td>
                        </tr>
                      </template>
                    </tbody>
                  </table>
                </div>
              </div>
            </template>

          </div>
        </template>
      </UTabs>
    </div>

    <!-- Modals -->
    <SyllabusSlideOver ref="slideOverRef" />
    <SyllabusCloneModal ref="cloneModalRef" />
    <CycleCloneModal ref="cycleCloneModalRef" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAcademicTimeStore } from '@/features/academic-time/store'
import { useSyllabusStore } from '@/features/syllabus/store'
import { useCatalogsStore } from '@/features/catalogs/store'
import CycleMaterialTemplates from '@/features/academic-time/components/CycleMaterialTemplates.vue'
import SyllabusDistributionMatrix from '@/features/syllabus/components/SyllabusDistributionMatrix.vue'
import SyllabusSlideOver from '@/features/syllabus/components/SyllabusSlideOver.vue'
import SyllabusCloneModal from '@/features/syllabus/components/SyllabusCloneModal.vue'
import CycleCloneModal from '@/features/syllabus/components/CycleCloneModal.vue'
import { PERMISSIONS } from '@/core/auth/permissions'

definePageMeta({
  layout: 'b2b',
  permissions: [PERMISSIONS.VIEW_ACADEMIC_TIME],
})

const route = useRoute()
const router = useRouter()
const store = useAcademicTimeStore()
const syllabusStore = useSyllabusStore()
const catalogsStore = useCatalogsStore()

const slideOverRef = ref<any>()
const cloneModalRef = ref<any>()
const cycleCloneModalRef = ref<any>()

const cycleId = computed(() => route.params.id as string)
const cycle = computed(() => store.cycles.find(c => c.id === cycleId.value))
const cycleName = computed(() => cycle.value?.name ?? 'Cargando ciclo...')

const tabItems = [
  { key: 'general', label: 'Configuración General', icon: 'i-heroicons-cog-8-tooth' },
  { key: 'materials', label: 'Plantillas de Material', icon: 'i-heroicons-document-duplicate' },
  { key: 'syllabus', label: 'Sílabos por Curso', icon: 'i-heroicons-book-open' },
]

const cycleStats = computed(() => {
  if (!cycle.value) return []
  const active = cycle.value.weeks.filter(w => w.isActive).length
  return [
    { label: 'Fecha Inicio', value: cycle.value.startDate },
    { label: 'Fecha Fin', value: cycle.value.endDate },
    { label: 'Días / Semana', value: `${cycle.value.daysPerWeek} días` },
    { label: 'Semanas Activas', value: `${active} / ${cycle.value.totalWeeks}` },
  ]
})

// ── Courses filtered by template ──
const templates = computed(() => store.templatesByCycle[cycleId.value] ?? [])

/** Set of courseIds that appear in at least one template of this cycle */
const templateCourseIds = computed(() => {
  const ids = new Set<string>()
  for (const tpl of templates.value) {
    for (const c of tpl.courses) {
      ids.add(c.courseId)
    }
  }
  return ids
})

/** Map from courseId → list of template names that include it */
const courseTemplateMap = computed(() => {
  const map = new Map<string, { id: string; name: string }[]>()
  for (const tpl of templates.value) {
    for (const c of tpl.courses) {
      if (!map.has(c.courseId)) map.set(c.courseId, [])
      map.get(c.courseId)!.push({ id: tpl.id, name: tpl.name })
    }
  }
  return map
})

const filteredCourseList = computed(() => {
  return catalogsStore.courses
    .filter(c => templateCourseIds.value.has(c.id))
    .map(course => {
      const syllabus = syllabusStore.syllabiList.find(s => s.courseId === course.id)
      return {
        ...course,
        syllabus,
        templates: courseTemplateMap.value.get(course.id) ?? [],
      }
    })
})

onMounted(async () => {
  if (store.cycles.length === 0) {
    await store.fetchCycles()
  }
  if (!cycle.value) {
    router.push('/academic-time')
    return
  }
  await Promise.all([
    store.fetchTemplates(cycleId.value),
    catalogsStore.fetchCourses(),
    syllabusStore.fetchSyllabiByCycle(cycleId.value),
  ])
})

function openSyllabus(syllabus: any) {
  syllabusStore.syllabus = syllabus
}

function backToSyllabusList() {
  syllabusStore.syllabus = null
}

function openCreate(courseId: string) {
  if (slideOverRef.value) {
    slideOverRef.value.form.courseId = courseId
    slideOverRef.value.form.cycleId = cycleId.value
    slideOverRef.value.isOpen = true
  }
}

function openCloneModal(courseId: string, syllabus?: any) {
  if (cloneModalRef.value && syllabus) {
    syllabusStore.syllabus = syllabus
    cloneModalRef.value.courseId = courseId
    cloneModalRef.value.isOpen = true
  } else {
    useToast().add({ title: 'Error', description: 'Debe crear el sílabo primero.', color: 'error' })
  }
}

function openCycleCloneModal() {
  if (cycleCloneModalRef.value) {
    cycleCloneModalRef.value.targetCycleId = cycleId.value;
    cycleCloneModalRef.value.isOpen = true;
  }
}

function goToMaterials() {
  router.push(`/academic-time/cycles/${cycleId.value}/materials`)
}
</script>
