import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

export interface OnboardingStepInfo {
  id: string
  label: string
  completed: boolean
}

export interface OnboardingProgress {
  stepsCompleted: string[]
  isDismissed: boolean
  progressPercentage: number
  availableSteps: OnboardingStepInfo[]
}

export const useOnboardingStore = defineStore('onboarding', () => {
  const stepsCompleted = ref<string[]>([])
  const isDismissed = ref(false)
  const progressPercentage = ref(0)
  const availableSteps = ref<OnboardingStepInfo[]>([])
  const hasFetched = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const isComplete = computed(() => progressPercentage.value >= 100)

  function getHeaders() {
    const authStore = useAuthStore()
    return { 'x-subdomain': authStore.getSubdomain() }
  }

  /** T019: Fetch onboarding progress from backend */
  async function fetchProgress() {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      // @ts-ignore
      const data = await $fetch<OnboardingProgress>('/api/v1/onboarding/progress', {
        headers: getHeaders(),
      })
      stepsCompleted.value = data.stepsCompleted
      isDismissed.value = data.isDismissed
      progressPercentage.value = data.progressPercentage
      availableSteps.value = data.availableSteps
      hasFetched.value = true
    } catch (e: any) {
      error.value = e.message || 'Error loading onboarding progress'
    } finally {
      isLoading.value = false
    }
  }

  /** T013: Seed demo data */
  async function seedDemo() {
    isLoading.value = true
    error.value = null
    try {
      // @ts-ignore
      const result = await $fetch('/api/v1/onboarding/seed-demo', {
        method: 'POST',
        headers: getHeaders(),
      })
      await fetchProgress()
      return result
    } catch (e: any) {
      const msg = e?.data?.message || e.message || 'Error al cargar datos demo'
      error.value = msg
      throw new Error(msg)
    } finally {
      isLoading.value = false
    }
  }

  /** T026: Dismiss the onboarding checklist widget */
  async function dismissChecklist() {
    try {
      // @ts-ignore
      await $fetch('/api/v1/onboarding/dismiss', {
        method: 'PATCH',
        headers: getHeaders(),
      })
      isDismissed.value = true
    } catch (e: any) {
      throw new Error(e.message || 'No se pudo ocultar la guía')
    }
  }

  /** T026: Clear all demo data */
  async function clearDemoData() {
    isLoading.value = true
    try {
      // @ts-ignore
      await $fetch('/api/v1/onboarding/clear-demo', {
        method: 'POST',
        headers: getHeaders(),
      })
      stepsCompleted.value = []
      progressPercentage.value = 0
      availableSteps.value = availableSteps.value.map((s) => ({ ...s, completed: false }))
    } catch (e: any) {
      throw new Error(e.message || 'Error al limpiar los datos de demostración')
    } finally {
      isLoading.value = false
    }
  }

  return {
    stepsCompleted,
    isDismissed,
    progressPercentage,
    availableSteps,
    hasFetched,
    isLoading,
    error,
    isComplete,
    fetchProgress,
    seedDemo,
    dismissChecklist,
    clearDemoData,
  }
})
