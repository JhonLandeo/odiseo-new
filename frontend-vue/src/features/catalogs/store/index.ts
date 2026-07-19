import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import type { CatalogCourse, CatalogTopic, CatalogSubtopic } from '../types'

export type { CatalogCourse, CatalogTopic, CatalogSubtopic }

export const useCatalogsStore = defineStore('catalogs', () => {
  const courses = ref<CatalogCourse[]>([])
  const lastSyncedAt = ref<string | null>(null)
  const isLoading = ref(false)
  const hasFetched = ref(false)
  const error = ref<string | null>(null)

  // Flattened list for Command Palette search
  const allTopics = computed(() =>
    courses.value.flatMap(c =>
      (c.topics || []).map(t => ({
        ...t,
        courseName: c.name
      }))
    )
  )

  async function fetchCourses(search?: string) {
    isLoading.value = true;
    error.value = null;
    try {
      const api = useApi();
      const url = search ? `/api/v1/catalogs/courses?search=${encodeURIComponent(search)}` : '/api/v1/catalogs/courses';
      const response = await api(url);
      if (Array.isArray(response)) {
        courses.value = (response as CatalogCourse[]).map(c => ({
          ...c,
          topics: []
        }));
      } else {
        const data = response as { courses: CatalogCourse[]; lastSyncedAt: string | null };
        courses.value = (data.courses || []).map(c => ({
          ...c,
          topics: []
        }));
        lastSyncedAt.value = data.lastSyncedAt;
      }
    } catch (e: any) {
      // A stale password hold (403 PASSWORD_CHANGE_REQUIRED) is now recovered
      // centrally by the `api` client interceptor, which marks the hold and
      // redirects before this catch runs. Anything reaching here is a real error.
      error.value = e.message || 'Error fetching catalogs'
    } finally {
      isLoading.value = false;
      hasFetched.value = true;
    }
  }

  async function fetchCourseTopics(courseId: string) {
    const course = courses.value.find(c => c.id === courseId)
    if (!course) return;
    try {
      const api = useApi();
      const response = await api(`/api/v1/catalogs/courses/${courseId}/topics`);
      course.topics = response as CatalogTopic[];
    } catch (e: any) {
      error.value = e.message || 'Error fetching course topics'
    }
  }

  // Optimistic UI: update topic immediately, revert on error
  async function toggleVisibility(topicId: string, isActive: boolean) {
    // 1. Find topic and parent course, and snapshot previous state
    let targetTopic: CatalogTopic | undefined;
    let targetCourse: CatalogCourse | undefined;
    for (const course of courses.value) {
      targetTopic = course.topics.find(t => t.id === topicId);
      if (targetTopic) {
        targetCourse = course;
        break;
      }
    }
    
    if (!targetTopic) return

    const prevIsActive = targetTopic.isActive

    // 2. Apply immediately (optimistic)
    targetTopic.isActive = isActive
    if (targetCourse && prevIsActive !== isActive) {
      if (isActive) {
        targetCourse.activeTopicsCount = (targetCourse.activeTopicsCount || 0) + 1;
      } else {
        targetCourse.activeTopicsCount = Math.max(0, (targetCourse.activeTopicsCount || 0) - 1);
      }
    }

    try {
      // 3. Persist
      const api = useApi();
      await api(`/api/v1/catalogs/topics/${topicId}/visibility`, {
        method: 'PATCH',
        body: { isActive }
      })
    } catch {
      // 4. Revert on error
      targetTopic.isActive = prevIsActive
      if (targetCourse && prevIsActive !== isActive) {
        if (prevIsActive) {
          targetCourse.activeTopicsCount = (targetCourse.activeTopicsCount || 0) + 1;
        } else {
          targetCourse.activeTopicsCount = Math.max(0, (targetCourse.activeTopicsCount || 0) - 1);
        }
      }
      throw new Error('No se pudo guardar el cambio de visibilidad. Intenta nuevamente.')
    }
  }

  return { courses, allTopics, lastSyncedAt, isLoading, hasFetched, error, fetchCourses, fetchCourseTopics, toggleVisibility }
})

// --- Mock data for development ---
function getMockData(): CatalogCourse[] {
  return [
    {
      id: 'c1', name: 'Matemáticas',
      topics: [
        { id: 't1', name: 'Álgebra Lineal', isActive: true,
          subtopics: [
            { id: 's1', name: 'Matrices' },
            { id: 's2', name: 'Vectores' },
          ]
        },
        { id: 't2', name: 'Cálculo Diferencial', isActive: true, subtopics: [] },
        { id: 't3', name: 'Geometría del Espacio', isActive: false, subtopics: [] },
      ]
    },
    {
      id: 'c2', name: 'Ciencias',
      topics: [
        { id: 't4', name: 'Física Cuántica', isActive: true, subtopics: [] },
        { id: 't5', name: 'Química Orgánica', isActive: true, subtopics: [] },
      ]
    },
    {
      id: 'c3', name: 'Lenguaje',
      topics: [
        { id: 't6', name: 'Comprensión Lectora', isActive: true, subtopics: [] },
      ]
    }
  ]
}
