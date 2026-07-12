import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '../auth.store'

export interface Tenant {
  id: string
  subdomain: string
  commercialName: string
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD'
  subscriptionPlanId: string
  gracePeriodUntil?: Date
  createdAt: Date
}

export const useAdminTenantsStore = defineStore('adminTenants', () => {
  const tenants = ref<Tenant[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchTenants = async () => {
    loading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const response = await $fetch<Tenant[]>('/api/v1/admin/tenants', {
        headers: { 'x-subdomain': authStore.getSubdomain() }
      })
      tenants.value = response
    } catch (e: any) {
      error.value = e.message || 'Error fetching tenants'
    } finally {
      loading.value = false
    }
  }

  const createTenant = async (data: { name: string; subdomain: string; subscription_plan_id: string }) => {
    loading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      await $fetch('/api/v1/admin/tenants', {
        method: 'POST',
        headers: { 'x-subdomain': authStore.getSubdomain() },
        body: data
      })
      await fetchTenants()
    } catch (e: any) {
      error.value = e.message || 'Error creating tenant'
      throw e
    } finally {
      loading.value = false
    }
  }

  return { tenants, loading, error, fetchTenants, createTenant }
})
