import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'

export interface SubscriptionPlan {
  id: string
  name: string
  price: number
  maxUsers: number
  maxPdfPagesPerMonth: number
  maxQuestionsPerMonth: number
  createdAt: Date
}

export const useAdminSubscriptionsStore = defineStore('adminSubscriptions', () => {
  const plans = ref<SubscriptionPlan[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchPlans = async () => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const response = await api<SubscriptionPlan[]>('/api/v1/admin/subscriptions/plans')
      plans.value = response
    } catch (e: any) {
      error.value = e.message || 'Error fetching plans'
    } finally {
      loading.value = false
    }
  }

  const createPlan = async (data: { name: string; price: number; max_users: number; max_pdf_pages_per_month: number; max_questions_per_month: number }) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api('/api/v1/admin/subscriptions/plans', {
        method: 'POST',
        body: data
      })
      await fetchPlans()
    } catch (e: any) {
      error.value = e.message || 'Error creating plan'
      throw e
    } finally {
      loading.value = false
    }
  }

  return { plans, loading, error, fetchPlans, createPlan }
})
