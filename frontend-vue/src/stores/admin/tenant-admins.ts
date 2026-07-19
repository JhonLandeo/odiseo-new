import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '@/composables/useApi'

export interface TenantAdmin {
  id: string
  name: string
  email: string
  is_active: boolean
  last_login?: string
  tenant_id: string
  created_at: string
}

export const useTenantAdminsStore = defineStore('tenantAdmins', () => {
  const admins = ref<TenantAdmin[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const fetchAdmins = async (tenantId: string) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const response: any = await api(`/api/v1/admin/tenants/${tenantId}/admins`)
      admins.value = response.data || []
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error fetching admins'
      throw e
    } finally {
      loading.value = false
    }
  }

  const createAdmin = async (tenantId: string, data: any) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${tenantId}/admins`, {
        method: 'POST',
        body: data
      })
      await fetchAdmins(tenantId)
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error creating admin'
      throw e
    } finally {
      loading.value = false
    }
  }

  const updateAdmin = async (tenantId: string, adminId: string, data: any) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}`, {
        method: 'PATCH',
        body: data
      })
      await fetchAdmins(tenantId)
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error updating admin'
      throw e
    } finally {
      loading.value = false
    }
  }

  const changePassword = async (tenantId: string, adminId: string, data: any) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}/password`, {
        method: 'PATCH',
        body: data
      })
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error changing password'
      throw e
    } finally {
      loading.value = false
    }
  }

  const deleteAdmin = async (tenantId: string, adminId: string) => {
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      await api(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}`, {
        method: 'DELETE'
      })
      await fetchAdmins(tenantId)
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error deleting admin'
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    admins,
    loading,
    error,
    fetchAdmins,
    createAdmin,
    updateAdmin,
    changePassword,
    deleteAdmin
  }
})
