import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '../auth.store'

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
      const authStore = useAuthStore()
      const response: any = await $fetch(`/api/v1/admin/tenants/${tenantId}/admins`, {
        headers: { 'x-subdomain': authStore.getSubdomain() }
      })
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
      const authStore = useAuthStore()
      await $fetch(`/api/v1/admin/tenants/${tenantId}/admins`, {
        method: 'POST',
        headers: { 'x-subdomain': authStore.getSubdomain() },
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
      const authStore = useAuthStore()
      await $fetch(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}`, {
        method: 'PATCH',
        headers: { 'x-subdomain': authStore.getSubdomain() },
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
      const authStore = useAuthStore()
      await $fetch(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}/password`, {
        method: 'PATCH',
        headers: { 'x-subdomain': authStore.getSubdomain() },
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
      const authStore = useAuthStore()
      await $fetch(`/api/v1/admin/tenants/${tenantId}/admins/${adminId}`, {
        method: 'DELETE',
        headers: { 'x-subdomain': authStore.getSubdomain() }
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
