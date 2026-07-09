import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

export interface CourseStatus {
  courseId: string;
  status: string;
}

export interface ReviewQuestionOption {
  label: string;
  text: string;
  is_correct: boolean;
}

export interface ReviewQuestion {
  id: string;
  questionId: string | null;
  courseId: string;
  topicId: string;
  topicName: string;
  subtopicId: string;
  subtopicName: string;
  position: number;
  expectedLevel?: string;
  status: 'FOUND' | 'EMPTY' | 'REPLACED' | 'REMOVED';
  htmlContent?: string | null;
  options?: ReviewQuestionOption[];
  code?: string;
  levelName?: string;
  type?: string;
  textOrigin?: string;
  images?: any[];
  solution?: any;
  configAlternative?: number;
}

export interface AllowedSyllabusUnit {
  courseId: string;
  topicId: string;
  topicName: string;
  subtopicId: string;
  subtopicName: string;
}

export interface DifficultyLimit {
  courseId: string;
  easy: number;
  medium: number;
  hard: number;
}

export interface ReviewData {
  materialId: string;
  status: string;
  version: number;
  weekNumber: number;
  cycleName: string;
  templateName: string;
  questions: ReviewQuestion[];
  allowedSyllabusUnits?: AllowedSyllabusUnit[];
  difficultyLimits?: DifficultyLimit[];
}

export const useMaterialsStore = defineStore('materials', () => {
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const currentReview = ref<ReviewData | null>(null)

  async function generateMaterial(data: {
    profile_id: string;
    week_number: number;
    requires_review: boolean;
    courses?: any[];
    design_template_id?: string;
  }) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch('/api/v1/materials/generate', {
        method: 'POST',
        headers: { 'x-subdomain': subdomain },
        body: data,
      })
      return res as {
        jobId: string;
        status: string;
        message: string;
        courses: CourseStatus[];
      }
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al generar material'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchHistory(query: { cycleIds?: string[], templateIds?: string[], weekNumbers?: number[] } = {}) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      
      const queryParams = new URLSearchParams();
      if (query.cycleIds?.length) queryParams.append('cycleIds', query.cycleIds.join(','));
      if (query.templateIds?.length) queryParams.append('templateIds', query.templateIds.join(','));
      if (query.weekNumbers?.length) queryParams.append('weekNumbers', query.weekNumbers.join(','));

      const url = `/api/v1/materials/history${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
      
      // @ts-ignore
      const res = await $fetch(url, {
        method: 'GET',
        headers: { 'x-subdomain': subdomain },
      })
      return res as any[]
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar el historial de materiales'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchReviewData(materialId: string) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const data = await $fetch(`/api/v1/materials/${materialId}/review`, {
        headers: { 'x-subdomain': subdomain },
      })
      currentReview.value = data as ReviewData
      return currentReview.value
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar datos de revisión'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function approveCuration(
    materialId: string,
    payload: {
      version: number;
      continueWithWarnings: boolean;
      replacements: { reviewQuestionId: string; questionId: string }[];
      removals: string[];
    }
  ) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/${materialId}/approve`, {
        method: 'POST',
        headers: { 'x-subdomain': subdomain },
        body: payload,
      })
      return res as {
        status: string;
        message: string;
      }
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al aprobar revisión'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchDownloadUrl(materialId: string, courseId: string) {
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/${materialId}/courses/${courseId}/download`, {
        headers: { 'x-subdomain': subdomain },
      })
      return res as {
        materialId: string;
        courseId: string;
        downloadUrl: string;
        expiresIn: number;
      }
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al obtener enlace de descarga'
      throw e
    }
  }

  async function fetchMergedDownloadUrl(materialId: string) {
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/${materialId}/download-merged`, {
        headers: { 'x-subdomain': subdomain },
      })
      return res as {
        materialId: string;
        downloadUrl: string;
        filename: string;
        expiresIn: number;
      }
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al obtener enlace de descarga combinada'
      throw e
    }
  }

  async function fetchAttempts(materialId: string) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/${materialId}/attempts`, {
        method: 'GET',
        headers: { 'x-subdomain': subdomain },
      })
      return res as any[]
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar el historial de intentos'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchQuestionPreview(questionId: string) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/question/${questionId}/preview`, {
        method: 'GET',
        headers: { 'x-subdomain': subdomain },
      })
      return res as any
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar la vista previa de la pregunta'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchQuestionAlternatives(courseId: string, topicId: string, subtopicId: string, levelId: string, limit: number = 3, excludeIds: string[] = []) {
    isLoading.value = true
    error.value = null
    try {
      const authStore = useAuthStore()
      const subdomain = authStore.getSubdomain()
      
      const payload: Record<string, any> = {
        limit: limit,
      };
      
      if (courseId) payload.courseId = courseId;
      if (topicId) payload.topicId = topicId;
      if (subtopicId) payload.subtopicId = subtopicId;
      if (levelId) payload.levelId = levelId;
      if (excludeIds && excludeIds.length > 0) payload.excludeIds = excludeIds;

      // @ts-ignore
      const res = await $fetch(`/api/v1/materials/question/alternatives/search`, {
        method: 'POST',
        headers: { 'x-subdomain': subdomain },
        body: payload
      })
      return res as any[]
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar alternativas'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  return {
    isLoading,
    error,
    currentReview,
    generateMaterial,
    fetchReviewData,
    approveCuration,
    fetchDownloadUrl,
    fetchMergedDownloadUrl,
    fetchHistory,
    fetchAttempts,
    fetchQuestionPreview,
    fetchQuestionAlternatives
  }
})
