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

export interface PaginatedTenants {
  data: Tenant[]
  total: number
  page: number
  pageSize: number
}

// Mirrors the backend's default page size (tenants-admin.service.ts,
// DEFAULT_TENANTS_PAGE_SIZE) so a call with no arguments requests the same
// page the server defaults to.
const DEFAULT_PAGE_SIZE = 25

export const useAdminTenantsStore = defineStore('adminTenants', () => {
  const tenants = ref<Tenant[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(DEFAULT_PAGE_SIZE)
  // Full active-tenant set for UI selectors (e.g. the dashboard's tenant
  // filter) that must offer every tenant, not just the current page of the
  // admin table — `tenants` above is paginated and unsuitable for that.
  const tenantsLite = ref<Pick<Tenant, 'id' | 'commercialName'>[]>([])

  const fetchTenantsLite = async () => {
    try {
      const api = useApi()
      tenantsLite.value = await api<Pick<Tenant, 'id' | 'commercialName'>[]>(
        '/api/v1/admin/tenants/lite',
      )
    } catch (e: any) {
      error.value = e.message || 'Error fetching tenants'
    }
  }

  const fetchTenants = async (options: { page?: number; pageSize?: number } = {}) => {
    const requestedPage = options.page ?? 1
    const requestedPageSize = options.pageSize ?? DEFAULT_PAGE_SIZE
    loading.value = true
    error.value = null
    try {
      const api = useApi()
      const response = await api<PaginatedTenants>('/api/v1/admin/tenants', {
        query: { page: requestedPage, pageSize: requestedPageSize },
      })
      tenants.value = response.data
      total.value = response.total
      // Reflect what the server actually served (it clamps pageSize server-side
      // too), which in the normal case is exactly what was requested.
      page.value = response.page
      pageSize.value = response.pageSize
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
      // Refresh the page the operator is currently viewing, not page 1 — a
      // mutation on page 3 must not silently yank them back to the start.
      await fetchTenants({ page: page.value, pageSize: pageSize.value })
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
      // Refresh the page the operator is currently viewing, not page 1 — a
      // mutation on page 3 must not silently yank them back to the start.
      await fetchTenants({ page: page.value, pageSize: pageSize.value })
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
      // Refresh the page the operator is currently viewing, not page 1 — a
      // mutation on page 3 must not silently yank them back to the start.
      await fetchTenants({ page: page.value, pageSize: pageSize.value })
    } catch (e: any) {
      error.value = e.message || 'Error updating tenant status'
      throw e
    } finally {
      loading.value = false
    }
  }


  return { tenants, loading, error, total, page, pageSize, fetchTenants, createTenant, updateTenant, updateTenantStatus, tenantsLite, fetchTenantsLite }
})
