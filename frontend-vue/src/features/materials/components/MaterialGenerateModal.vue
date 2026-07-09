<template>
  <UModal v-model:open="isOpen">
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium leading-6 text-gray-900 dark:text-white">
              Generar Material
            </h3>
            <UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" class="-my-1" @click="isOpen = false" />
          </div>
        </template>

        <div class="space-y-4">
          <!-- Week Selection -->
          <UFormField label="Semana Objetivo" name="weekNumber">
            <USelect v-model="form.weekNumber" :items="availableWeeksOptions" value-key="value" label-key="label" placeholder="Selecciona la semana..." class="w-full" />
          </UFormField>

          <!-- Course Selection -->
          <UFormField label="Cursos" name="courses">
            <USelectMenu
              v-model="form.selectedCourseId"
              :items="courseOptions"
              value-key="id"
              label-key="name"
              placeholder="Seleccione un curso"
              :ui="{ content: 'z-popover' }"
              class="w-full"
            >
              <template #default>
                {{ courseOptions.find(o => o.id === form.selectedCourseId)?.name || 'Seleccione un curso' }}
              </template>
            </USelectMenu>
          </UFormField>

          <!-- Design Template Selection -->
          <div class="border-t border-slate-100 dark:border-white/5 pt-4">
            <PdfDesignSelector
              v-model="form.designTemplateId"
              :course-name="courseOptions.find(o => o.id === form.selectedCourseId)?.name || 'Curso'"
              :week-number="form.weekNumber"
              :template-name="selectedTemplate?.name || 'Material'"
              :cycle-name="currentCycleName"
            />
          </div>

          <!-- Requires Review -->
          <UFormField label="Opciones" name="requiresReview">
            <UCheckbox v-model="form.requiresReview" label="Marcar para revisión antes de publicar" />
            <p class="text-xs text-slate-500 mt-1 ml-6">Si se activa, el PDF generado se guardará en estado borrador.</p>
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end space-x-2">
            <UButton color="white" @click="isOpen = false">Cancelar</UButton>
            <UButton color="primary" :loading="isSubmitting" @click="submit">Generar</UButton>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useAcademicTimeStore } from '@/features/academic-time/store'
import { useCatalogsStore } from '@/features/catalogs/store'
import { usePdfDesignsStore } from '../store/pdfDesigns'
import PdfDesignSelector from './PdfDesignSelector.vue'

const props = defineProps<{
  cycleId?: string
  defaultTemplateId?: string
}>()

const isOpen = defineModel<boolean>()
const emit = defineEmits(['generated'])

const academicStore = useAcademicTimeStore()
const catalogsStore = useCatalogsStore()
const pdfDesignsStore = usePdfDesignsStore()

const form = reactive({
  weekNumber: 1,
  selectedCourseId: '',
  requiresReview: true,
  designTemplateId: null as string | null
})

const isSubmitting = ref(false)

const selectedTemplate = computed(() => {
  if (!props.cycleId || !props.defaultTemplateId) return null
  const templates = academicStore.templatesByCycle[props.cycleId] || []
  return templates.find(t => t.id === props.defaultTemplateId) || null
})

const courseOptions = computed(() => {
  if (!selectedTemplate.value) return []
  return selectedTemplate.value.courses.map(tc => {
    const course = catalogsStore.courses.find(c => c.id === tc.courseId)
    return {
      id: tc.courseId,
      name: course ? course.name : tc.courseId
    }
  })
})

const currentCycleName = computed(() => {
  if (!props.cycleId) return 'Ciclo'
  const cycle = academicStore.cycles.find(c => c.id === props.cycleId)
  return cycle ? cycle.name : 'Ciclo'
})

// Prefill form values when opened
watch(isOpen, async (newVal) => {
  if (newVal) {
    if (catalogsStore.courses.length === 0) {
      await catalogsStore.fetchCourses()
    }
    if (academicStore.cycles.length === 0) {
      await academicStore.fetchCycles()
    }
    await pdfDesignsStore.fetchDesigns()

    // Preselect default design template
    const defaultDesign = pdfDesignsStore.designs.find(d => d.isDefault)
    form.designTemplateId = defaultDesign?.id || null

    // Preselect first course option if available
    if (courseOptions.value.length > 0) {
      form.selectedCourseId = courseOptions.value[0].id
    }
  }
})

async function submit() {
  if (!form.selectedCourseId) return
  isSubmitting.value = true
  try {
    const payload = {
      profile_id: props.defaultTemplateId || '123e4567-e89b-12d3-a456-426614174000',
      week_number: form.weekNumber,
      requires_review: form.requiresReview,
      courses: [{ course_id: form.selectedCourseId }],
      design_template_id: form.designTemplateId || undefined
    }

    const response = await $fetch('/api/v1/materials/generate', {
      method: 'POST',
      body: payload
    })

    emit('generated', response)
    isOpen.value = false
  } catch (err) {
    console.error('Error generating material:', err)
  } finally {
    isSubmitting.value = false
  }
}
</script>
