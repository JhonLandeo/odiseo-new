import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'

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

  async function fetchProgress() {
    if (isLoading.value) return
    isLoading.value = true
    error.value = null
    try {
      const api = useApi()
      const data = await api<OnboardingProgress>('/api/v1/onboarding/progress')
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

  async function dismissTour() {
    try {
      const api = useApi()
      await api('/api/v1/onboarding/dismiss', {
        method: 'PATCH',
      })
      isDismissed.value = true
    } catch (e: any) {
      throw new Error(e.message || 'No se pudo ocultar la guía')
    }
  }

  async function resetTour() {
    isLoading.value = true
    try {
      const api = useApi()
      await api('/api/v1/onboarding/reset', {
        method: 'PATCH',
      })
      isDismissed.value = false
      await fetchProgress()
    } catch (e: any) {
      throw new Error(e.message || 'Error al reiniciar el tour')
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
    dismissTour,
    resetTour,
  }
})
