import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'

export interface Tenant {
  id: string
  subdomain: string
  commercialName: string
  status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD'
  subscriptionPlanId: string
  contactEmail?: string
  phone?: string
  address?: string
  taxId?: string
  logoUrl?: string
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
      const api = useApi()
      const response = await api<Tenant[]>('/api/v1/admin/tenants')
      tenants.value = response
    } catch (e: any) {
      error.value = e.message || 'Error fetching tenants'
    } finally {
      loading.value = false
    }
  }

  const createTenant = async (data: { 
    name: string; 
    subdomain: string; 
    subscription_plan_id: string; 
    adminEmail: string; 
    adminPassword?: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    logoUrl?: string;
  }) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api('/api/v1/admin/tenants', {
        method: 'POST',
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

  const updateTenant = async (id: string, data: { 
    commercialName?: string; 
    subscription_plan_id?: string;
    contactEmail?: string;
    phone?: string;
    address?: string;
    taxId?: string;
    logoUrl?: string;
  }) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${id}`, {
        method: 'PATCH',
        body: data
      })
      await fetchTenants()
    } catch (e: any) {
      error.value = e.message || 'Error updating tenant'
      throw e
    } finally {
      loading.value = false
    }
  }

  const updateTenantStatus = async (id: string, status: 'ACTIVE' | 'SUSPENDED' | 'GRACE_PERIOD') => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${id}/status`, {
        method: 'PATCH',
        body: { status }
      })
      await fetchTenants()
    } catch (e: any) {
      error.value = e.message || 'Error updating tenant status'
      throw e
    } finally {
      loading.value = false
    }
  }


  return { tenants, loading, error, fetchTenants, createTenant, updateTenant, updateTenantStatus }
})
