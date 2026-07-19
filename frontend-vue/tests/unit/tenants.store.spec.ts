import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * The backend paginates GET /api/v1/admin/tenants (tenants-admin.service.ts
 * findAll()) instead of loading every tenant, to cut the O(N) per-tenant
 * schema fan-out the audit flagged. These tests cover the store's side of
 * that contract: it requests page/pageSize, unwraps `{ data, total, page,
 * pageSize }` into `tenants` plus the new pagination refs, and mutations
 * refresh the operator's current page instead of resetting to page 1.
 */

const api = vi.fn();
vi.mock('@/composables/useApi', () => ({ useApi: () => api }));

import { useAdminTenantsStore } from '../../src/stores/admin/tenants';

function buildTenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-1',
    subdomain: 'colegio',
    commercialName: 'Colegio Test',
    status: 'ACTIVE',
    subscriptionPlanId: 'plan-1',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function pageResponse(
  data: unknown[],
  overrides: Partial<{ total: number; page: number; pageSize: number }> = {},
) {
  return {
    data,
    total: overrides.total ?? data.length,
    page: overrides.page ?? 1,
    pageSize: overrides.pageSize ?? 25,
  };
}

describe('Admin Tenants Store (paginación server-side)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    api.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchTenants', () => {
    it('requests page 1 and the default pageSize when called with no arguments', async () => {
      const store = useAdminTenantsStore();
      api.mockResolvedValue(pageResponse([buildTenant()]));

      await store.fetchTenants();

      expect(api).toHaveBeenCalledWith('/api/v1/admin/tenants', {
        query: { page: 1, pageSize: 25 },
      });
    });

    it('requests the given page and pageSize', async () => {
      const store = useAdminTenantsStore();
      api.mockResolvedValue(pageResponse([buildTenant()], { page: 3, pageSize: 10 }));

      await store.fetchTenants({ page: 3, pageSize: 10 });

      expect(api).toHaveBeenCalledWith('/api/v1/admin/tenants', {
        query: { page: 3, pageSize: 10 },
      });
    });

    it('unwraps the paginated response: tenants gets `data`, not the envelope', async () => {
      const store = useAdminTenantsStore();
      const tenant = buildTenant();
      api.mockResolvedValue(pageResponse([tenant], { total: 47, page: 2, pageSize: 10 }));

      await store.fetchTenants({ page: 2, pageSize: 10 });

      expect(store.tenants).toEqual([tenant]);
      expect(store.total).toBe(47);
      expect(store.page).toBe(2);
      expect(store.pageSize).toBe(10);
    });

    it('reports the fetch error and stops loading', async () => {
      const store = useAdminTenantsStore();
      api.mockRejectedValue(new Error('Network Error'));

      await store.fetchTenants();

      expect(store.error).toBe('Network Error');
      expect(store.loading).toBe(false);
    });
  });

  describe('mutations refresh the operator’s current page', () => {
    it('createTenant refetches the page the store was already on, not page 1', async () => {
      const store = useAdminTenantsStore();
      // Land the store on page 3 first.
      api.mockResolvedValueOnce(pageResponse([buildTenant()], { page: 3, pageSize: 10, total: 50 }));
      await store.fetchTenants({ page: 3, pageSize: 10 });
      api.mockClear();

      api.mockResolvedValue(pageResponse([buildTenant()], { page: 3, pageSize: 10, total: 51 }));
      await store.createTenant({
        name: 'Nuevo Colegio',
        subdomain: 'nuevo',
        subscription_plan_id: 'plan-1',
        adminEmail: 'admin@nuevo.edu',
      });

      expect(api).toHaveBeenCalledWith('/api/v1/admin/tenants', {
        query: { page: 3, pageSize: 10 },
      });
    });

    it('updateTenantStatus refetches the page the store was already on', async () => {
      const store = useAdminTenantsStore();
      api.mockResolvedValueOnce(pageResponse([buildTenant()], { page: 2, pageSize: 25, total: 40 }));
      await store.fetchTenants({ page: 2 });
      api.mockClear();

      api.mockResolvedValueOnce({ success: true });
      api.mockResolvedValue(pageResponse([buildTenant()], { page: 2, pageSize: 25, total: 40 }));
      await store.updateTenantStatus('tenant-1', 'SUSPENDED');

      expect(api).toHaveBeenCalledWith('/api/v1/admin/tenants', {
        query: { page: 2, pageSize: 25 },
      });
    });
  });

  // Consumers that must offer every active tenant (the dashboard's tenant
  // filter) cannot use `tenants` — it's now a page. The pagination fix must
  // not silently truncate that selector to the default page size.
  describe('fetchTenantsLite (full active-tenant set for UI selectors)', () => {
    it('requests the lite endpoint and stores the full result, unpaginated', async () => {
      const store = useAdminTenantsStore();
      const lite = [
        { id: 'c1', commercialName: 'Colegio Uno' },
        { id: 'c2', commercialName: 'Colegio Dos' },
      ];
      api.mockResolvedValue(lite);

      await store.fetchTenantsLite();

      expect(api).toHaveBeenCalledWith('/api/v1/admin/tenants/lite');
      expect(store.tenantsLite).toEqual(lite);
    });
  });
});
