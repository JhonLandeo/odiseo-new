import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth.store'

export interface PdfDesignTemplate {
  id: string
  name: string
  bannerImageUrl: string | null
  watermarkImageUrl: string | null
  coverImageUrl: string | null
  showCover: boolean
  showTopicsList: boolean
  primaryTitleColor: string | null
  secondaryTitleColor: string | null
  backgroundHighlightColor: string | null
  marginTop: string
  marginBottom: string
  marginInside: string
  marginOutside: string
  isBookMode: boolean
  fontFamily: string
  borderRadius: string
  contentFontSize: string
  contentTextColor: string
  blocksConfig: any | null
  headerConfig: any | null
  footerConfig: any | null
  isDefault: boolean
  createdAt: string
  cycleCount?: number
}

export const usePdfDesignsStore = defineStore('pdfDesigns', () => {
  const designs = ref<PdfDesignTemplate[]>([])
  const currentDesign = ref<PdfDesignTemplate | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  function getHeaders() {
    const authStore = useAuthStore()
    return { 'x-subdomain': authStore.getSubdomain() }
  }

  async function fetchDesigns() {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch('/api/v1/pdf-designs', { headers: getHeaders() })
      designs.value = data as PdfDesignTemplate[]
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar diseños'
    } finally {
      isLoading.value = false
    }
  }

  async function fetchDesign(id: string) {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch(`/api/v1/pdf-designs/${id}`, { headers: getHeaders() })
      currentDesign.value = data as PdfDesignTemplate
      return currentDesign.value
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al cargar diseño'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function createDesign(dto: Partial<PdfDesignTemplate>) {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch('/api/v1/pdf-designs', {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: dto,
      })
      designs.value.unshift(data as PdfDesignTemplate)
      return data as PdfDesignTemplate
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al crear diseño'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function updateDesign(id: string, dto: Partial<PdfDesignTemplate>) {
    isLoading.value = true
    error.value = null
    try {
      const data = await $fetch(`/api/v1/pdf-designs/${id}`, {
        method: 'PATCH',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: dto,
      })
      const idx = designs.value.findIndex(d => d.id === id)
      if (idx >= 0) designs.value[idx] = data as PdfDesignTemplate
      if (currentDesign.value?.id === id) currentDesign.value = data as PdfDesignTemplate
      return data as PdfDesignTemplate
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al actualizar diseño'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function deleteDesign(id: string) {
    isLoading.value = true
    error.value = null
    try {
      await $fetch(`/api/v1/pdf-designs/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      designs.value = designs.value.filter(d => d.id !== id)
      if (currentDesign.value?.id === id) currentDesign.value = null
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al eliminar diseño'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function uploadAsset(designId: string, file: File, type: 'banner' | 'watermark' | 'grid_image' | 'cover') {
    isLoading.value = true
    error.value = null
    try {
      const form = new FormData()
      form.append('file', file)
      const data = await $fetch(`/api/v1/pdf-designs/${designId}/upload-asset?type=${type}`, {
        method: 'POST',
        headers: getHeaders(),
        body: form,
      })
      const result = data as { url: string }
      if (type !== 'grid_image') {
        const design = designs.value.find(d => d.id === designId)
        if (design) {
          if (type === 'banner') design.bannerImageUrl = result.url
          else if (type === 'watermark') design.watermarkImageUrl = result.url
          else if (type === 'cover') design.coverImageUrl = result.url
        }
        if (currentDesign.value?.id === designId) {
          if (type === 'banner') currentDesign.value.bannerImageUrl = result.url
          else if (type === 'watermark') currentDesign.value.watermarkImageUrl = result.url
          else if (type === 'cover') currentDesign.value.coverImageUrl = result.url
        }
      }
      return result.url
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al subir asset'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function deleteAsset(designId: string, type: 'banner' | 'watermark' | 'cover') {
    isLoading.value = true
    error.value = null
    try {
      await $fetch(`/api/v1/pdf-designs/${designId}/asset?type=${type}`, {
        method: 'DELETE',
        headers: getHeaders(),
      })
      const design = designs.value.find(d => d.id === designId)
      if (design) {
        if (type === 'banner') design.bannerImageUrl = null
        else if (type === 'watermark') design.watermarkImageUrl = null
        else if (type === 'cover') design.coverImageUrl = null
      }
      if (currentDesign.value?.id === designId) {
        if (type === 'banner') currentDesign.value.bannerImageUrl = null
        else if (type === 'watermark') currentDesign.value.watermarkImageUrl = null
        else if (type === 'cover') currentDesign.value.coverImageUrl = null
      }
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al eliminar asset'
      throw e
    } finally {
      isLoading.value = false
    }
  }

  async function fetchPreview(designId: string, body?: Record<string, any>) {
    try {
      const data = await $fetch(`/api/v1/pdf-designs/${designId}/preview`, {
        method: 'POST',
        headers: { ...getHeaders(), 'Content-Type': 'application/json' },
        body: body || {},
      })
      return (data as { html: string }).html
    } catch (e: any) {
      error.value = e.data?.message || e.message || 'Error al generar preview'
      throw e
    }
  }

  return {
    designs, currentDesign, isLoading, error,
    fetchDesigns, fetchDesign, createDesign, updateDesign, deleteDesign,
    uploadAsset, deleteAsset, fetchPreview,
  }
})
