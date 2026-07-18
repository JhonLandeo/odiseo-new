<template>
  <!-- Global Command Palette (Cmd+K / Ctrl+K) -->
  <UModal v-model:open="isOpen" class="cmd-palette" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <div class="p-0">
        <!-- Search Input -->
        <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            placeholder="Buscar temas, semanas, ajustes..."
            class="flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 outline-none cmd-palette-input"
          />
          <kbd class="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 text-xs text-gray-500">
            esc
          </kbd>
        </div>

        <!-- Results -->
        <div class="max-h-80 overflow-y-auto py-2">
          <!-- Navigation links -->
          <div v-if="!query" class="px-2">
            <p class="px-2 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">Navegación</p>
            <button
              v-for="link in navLinks"
              :key="link.to"
              class="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
              @click="navigate(link.to)"
            >
              <span class="text-gray-400">{{ link.icon }}</span>
              {{ link.label }}
            </button>
          </div>

          <!-- Topic search results -->
          <div v-else class="px-2">
            <p class="px-2 py-1.5 text-[11px] font-medium text-gray-400 uppercase tracking-wider">
              Temas ({{ filteredTopics.length }})
            </p>
            <div v-if="filteredTopics.length === 0" class="px-2 py-4 text-center text-sm text-gray-400">
              Sin resultados para "{{ query }}"
            </div>
            <button
              v-for="topic in filteredTopics.slice(0, 8)"
              :key="topic.id"
              class="w-full flex items-center gap-3 px-2 py-2 rounded-md text-sm hover:bg-gray-50 transition-colors text-left"
              @click="navigate('/catalogs')"
            >
              <span class="w-2 h-2 rounded-full shrink-0" :class="topic.isActive ? 'bg-emerald-400' : 'bg-gray-300'" />
              <span class="flex-1 truncate text-gray-900">{{ topic.name }}</span>
              <span class="text-xs text-gray-400">{{ topic.courseName }}</span>
            </button>
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center gap-3 px-4 py-2 border-t border-gray-100 bg-gray-50/50">
          <span class="flex items-center gap-1 text-xs text-gray-400">
            <kbd class="inline-flex h-4 items-center rounded border border-gray-200 bg-white px-1 text-xs">↑↓</kbd> navegar
          </span>
          <span class="flex items-center gap-1 text-xs text-gray-400">
            <kbd class="inline-flex h-4 items-center rounded border border-gray-200 bg-white px-1 text-xs">↵</kbd> abrir
          </span>
          <span class="flex items-center gap-1 text-xs text-gray-400 ml-auto">
            <kbd class="inline-flex h-4 items-center rounded border border-gray-200 bg-white px-1 text-xs">esc</kbd> cerrar
          </span>
        </div>
      </div>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCatalogsStore } from '../../features/catalogs/store'

const router = useRouter()
const store = useCatalogsStore()
const isOpen = ref(false)
const query = ref('')
const inputRef = ref<HTMLInputElement>()

const navLinks = [
  { to: '/catalogs', label: 'Catálogos de Cursos', icon: '📚' },
  { to: '/academic-time', label: 'Tiempo Académico', icon: '📅' },
]

const filteredTopics = computed(() => {
  if (!query.value) return []
  const q = query.value.toLowerCase()
  return store.allTopics.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.courseName.toLowerCase().includes(q)
  )
})

function navigate(to: string) {
  router.push(to)
  isOpen.value = false
  query.value = ''
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    isOpen.value = !isOpen.value
  }
  if (e.key === 'Escape') {
    isOpen.value = false
  }
}

watch(isOpen, async (val) => {
  if (val) {
    await nextTick()
    inputRef.value?.focus()
    if (!store.courses.length) store.fetchCourses()
  } else {
    query.value = ''
  }
})

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>
