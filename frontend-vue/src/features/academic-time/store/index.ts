import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useApi } from '@/composables/useApi'

export interface CycleWeek {
  id: string;
  cycleId: string;
  weekNumber: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface Cycle {
  id: string;
  name: string;
  year: number;
  startDate: string;
  endDate: string;
  daysPerWeek: number;
  totalWeeks: number;
  isActive: boolean;
  weeks: CycleWeek[];
  templateCount?: number;
}

export interface CycleMaterialTemplateCourse {
  id?: string;
  courseId: string;
  questionsQuantity: number;
  easyCount: number;
  mediumCount: number;
  hardCount: number;
}

export interface CycleMaterialTemplate {
  id: string;
  cycleId: string;
  name: string;
  scope: 'CURRENT_WEEK' | 'ACCUMULATIVE' | 'FULL_ACCUMULATIVE';
  accumulationWeeks: number | null;
  courses: CycleMaterialTemplateCourse[];
}

export const useAcademicTimeStore = defineStore('academicTime', () => {
  const cycles = ref<Cycle[]>([])
  const templatesByCycle = ref<Record<string, CycleMaterialTemplate[]>>({})
  const isLoading = ref(false)
  const isLoadingTemplates = ref(false)
  const hasFetched = ref(false)
  const error = ref<string | null>(null)
  
  const totalCycles = ref(0)
  const currentOffset = ref(0)
  const limit = 20

  const hasMore = computed(() => cycles.value.length < totalCycles.value)
  const currentSearch = ref('')

  async function fetchCycles(loadMore = false, searchStr?: string) {
    if (isLoading.value) return;

    const targetSearch = searchStr !== undefined ? searchStr : '';
    if (targetSearch !== currentSearch.value) {
      currentSearch.value = targetSearch;
      loadMore = false; // Fresh search implies fresh data
    }

    isLoading.value = true;
    error.value = null;

    if (!loadMore) {
      currentOffset.value = 0;
      cycles.value = []; // Clear current UI list instantly for a snappy search UX
    }

    try {
      const api = useApi();
      const url = `/api/v1/academic-time/cycles?limit=${limit}&offset=${currentOffset.value}${currentSearch.value ? `&search=${encodeURIComponent(currentSearch.value)}` : ''}`

      console.log('[AcademicTimeStore] fetchCycles requested URL:', url);

      const response = await api(url);
      
      const { data, total } = response as { data: Cycle[], total: number };
      
      console.log('[AcademicTimeStore] fetchCycles response data:', data, 'total:', total);

      if (loadMore) {
        // Prevent duplicate keys in Vue v-for by filtering existing IDs
        const existingIds = new Set(cycles.value.map(c => c.id));
        const newCycles = data.filter(c => !existingIds.has(c.id));
        cycles.value = [...cycles.value, ...newCycles];
      } else {
        cycles.value = data;
      }
      
      totalCycles.value = total;
      currentOffset.value += data.length;
      hasFetched.value = true;
    } catch (e: any) {
      console.error('[AcademicTimeStore] Error in fetchCycles:', e);
      error.value = e.message || 'Error fetching cycles'
    } finally {
      isLoading.value = false
    }
  }

  async function createCycle(data: { name: string; year: number; startDate: string; daysPerWeek: number; totalWeeks: number }) {
    try {
      const api = useApi();
      await api('/api/v1/academic-time/cycles', {
        method: 'POST',
        body: data
      })
      await fetchCycles()
    } catch (e: any) {
      throw new Error(e.message || 'Error al crear el ciclo')
    }
  }

  async function updateCycle(id: string, data: { name: string; year: number; startDate: string; daysPerWeek: number; totalWeeks: number }) {
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${id}`, {
        method: 'PATCH',
        body: data
      })
      await fetchCycles()
    } catch (e: any) {
      if (e.status === 409) {
        throw new Error('No se pueden modificar las fechas porque el ciclo ya tiene sílabos asignados.')
      }
      throw new Error(e.message || 'Error al actualizar el ciclo')
    }
  }

  async function toggleCycleVisibility(id: string, isActive: boolean) {
    const cycle = cycles.value.find(c => c.id === id)
    if (!cycle) return
    const prev = cycle.isActive
    cycle.isActive = isActive
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${id}/visibility`, {
        method: 'PATCH',
        body: { isActive }
      })
    } catch {
      cycle.isActive = prev
      throw new Error('No se pudo guardar la visibilidad del ciclo.')
    }
  }

  async function toggleWeekVisibility(id: string, isActive: boolean) {
    let targetWeek: CycleWeek | undefined;
    for (const cycle of cycles.value) {
      targetWeek = cycle.weeks.find(w => w.id === id);
      if (targetWeek) break;
    }
    if (!targetWeek) return
    const prev = targetWeek.isActive
    targetWeek.isActive = isActive
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/weeks/${id}/visibility`, {
        method: 'PATCH',
        body: { isActive }
      })
    } catch {
      targetWeek.isActive = prev
      throw new Error('No se pudo guardar la visibilidad de la semana.')
    }
  }

  async function deleteCycle(id: string) {
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${id}`, {
        method: 'DELETE'
      })
      await fetchCycles()
    } catch (e: any) {
      if (e.status === 409) {
        throw new Error('No se puede eliminar el ciclo porque tiene sílabos asociados. Desactívalo en su lugar.')
      }
      throw new Error('Error al eliminar el ciclo.')
    }
  }

  // --- Material Templates ---

  async function fetchTemplates(cycleId: string) {
    isLoadingTemplates.value = true;
    try {
      const api = useApi();
      const data = await api(`/api/v1/academic-time/cycles/${cycleId}/templates`)
      templatesByCycle.value[cycleId] = data as CycleMaterialTemplate[];
    } catch (e: any) {
      console.error('Error fetching templates', e);
      throw new Error('Error al cargar las plantillas del ciclo.');
    } finally {
      isLoadingTemplates.value = false;
    }
  }

  async function createTemplate(cycleId: string, data: Partial<CycleMaterialTemplate>) {
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${cycleId}/templates`, {
        method: 'POST',
        body: data
      })
      await fetchTemplates(cycleId)
    } catch (e: any) {
      if (e.data) throw e;
      throw new Error(e.message || 'Error al crear la plantilla')
    }
  }

  async function updateTemplate(cycleId: string, templateId: string, data: Partial<CycleMaterialTemplate>) {
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${cycleId}/templates/${templateId}`, {
        method: 'PUT',
        body: data
      })
      await fetchTemplates(cycleId)
    } catch (e: any) {
      if (e.data) throw e;
      throw new Error(e.message || 'Error al actualizar la plantilla')
    }
  }

  async function deleteTemplate(cycleId: string, templateId: string) {
    try {
      const api = useApi();
      await api(`/api/v1/academic-time/cycles/${cycleId}/templates/${templateId}`, {
        method: 'DELETE'
      })
      await fetchTemplates(cycleId)
    } catch (e: any) {
      throw new Error(e.message || 'Error al eliminar la plantilla')
    }
  }

  return { 
    cycles, templatesByCycle, isLoading, isLoadingTemplates, hasFetched, error, hasMore,
    fetchCycles, createCycle, updateCycle, toggleCycleVisibility, toggleWeekVisibility, deleteCycle,
    fetchTemplates, createTemplate, updateTemplate, deleteTemplate
  }
})
