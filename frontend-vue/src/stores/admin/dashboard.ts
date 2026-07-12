import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '../auth.store'

export interface DashboardMetrics {
  active_users: number
  storage_mb: number
  pdf_pages_generated: number
  questions_used: number
}

export const useAdminDashboardStore = defineStore('adminDashboard', () => {
  const metrics = ref<DashboardMetrics | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchMetrics = async (tenantId: string, startDate?: string, endDate?: string) => {
    loading.value = true
    error.value = null
    try {
      const authStore = useAuthStore();
      const response = await $fetch<DashboardMetrics>('/api/v1/admin/dashboard/metrics', {
        headers: { 'x-subdomain': authStore.getSubdomain() },
        query: { tenant_id: tenantId, start_date: startDate, end_date: endDate }
      })
      metrics.value = response
    } catch (e: any) {
      error.value = e.message || 'Error fetching metrics'
    } finally {
      loading.value = false
    }
  }

  return { metrics, loading, error, fetchMetrics }
})
