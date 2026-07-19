<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useCatalogsStore } from '../../catalogs/store';

const props = defineProps<{
  courseId: string;
  existingKeys?: string[];
}>();

const emit = defineEmits<{
  (e: 'add-subtopics', selected: { topicId: string; subtopicId: string; topicName: string; subtopicName: string; topicIsActive: boolean }[]): void;
}>();

const catalogsStore = useCatalogsStore();
const isOpen = ref(false);
const searchQuery = ref('');
const selectedSubtopics = ref<Set<string>>(new Set());

const course = computed(() => catalogsStore.courses.find(c => c.id === props.courseId));
const activeTopics = computed(() => course.value?.topics.filter(t => t.isActive) || []);

const allExistingKeys = computed(() => new Set(props.existingKeys || []));

const isAlreadyAdded = (topicId: string, subtopicId: string) => {
  return allExistingKeys.value.has(`${topicId}|${subtopicId}`);
};

const filteredTopics = computed(() => {
  const query = searchQuery.value.toLowerCase().trim();
  
  return activeTopics.value.map(topic => {
    let subtopics = topic.subtopics;

    // If search query, filter by search
    if (query) {
      subtopics = subtopics.filter(sub =>
        sub.name.toLowerCase().includes(query) ||
        topic.name.toLowerCase().includes(query)
      );
    }

    // If no subtopics, handle general topic
    if (topic.subtopics.length === 0) {
      return topic;
    }

    if (subtopics.length === 0) return null;

    return { ...topic, subtopics };
  }).filter(t => t !== null) as typeof activeTopics.value;
});

const open = () => {
  searchQuery.value = '';
  selectedSubtopics.value = new Set();
  isOpen.value = true;
};

const close = () => {
  isOpen.value = false;
};

const toggleSubtopic = (topicId: string, subtopicId: string) => {
  const key = `${topicId}|${subtopicId}`;
  if (selectedSubtopics.value.has(key)) {
    selectedSubtopics.value.delete(key);
  } else {
    selectedSubtopics.value.add(key);
  }
};

const isSelected = (topicId: string, subtopicId: string) => {
  return selectedSubtopics.value.has(`${topicId}|${subtopicId}`);
};

const addSelected = () => {
  const itemsToAdd = [];
  for (const key of selectedSubtopics.value) {
    const [tId, sId] = key.split('|');
    const topic = activeTopics.value.find(t => t.id === tId);
    if (topic) {
      const subtopic = topic.subtopics.find(s => s.id === sId);
      if (subtopic) {
        itemsToAdd.push({
          topicId: topic.id,
          subtopicId: subtopic.id,
          topicName: topic.name,
          subtopicName: subtopic.name,
          topicIsActive: topic.isActive !== false
        });
      } else if (!sId) {
        itemsToAdd.push({
          topicId: topic.id,
          subtopicId: '',
          topicName: topic.name,
          subtopicName: '',
          topicIsActive: topic.isActive !== false
        });
      }
    }
  }
  emit('add-subtopics', itemsToAdd);
  close();
};

defineExpose({ open, close });
</script>

<template>
  <Transition name="backdrop-fade">
    <div v-if="isOpen" class="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-40" @click="close" />
  </Transition>

  <Transition name="slideover">
    <div v-if="isOpen" class="fixed inset-y-0 right-0 w-full max-w-md bg-white dark:bg-[#1e1e2d] shadow-xl z-50 flex flex-col">
      <!-- Header -->
      <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between shrink-0">
        <div>
          <h2 class="text-xl font-bold text-gray-900 dark:text-white">Añadir Temas al Sílabo</h2>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Selecciona los subtemas que deseas impartir en el ciclo.</p>
        </div>
        <UButton color="neutral" variant="ghost" icon="i-heroicons-x-mark" @click="close" />
      </div>

      <!-- Search -->
      <div class="px-6 py-4 border-b border-gray-100 dark:border-gray-800/50 bg-gray-50/50 dark:bg-gray-800/20 shrink-0">
        <UInput 
          v-model="searchQuery" 
          icon="i-heroicons-magnifying-glass" 
          placeholder="Buscar tema o subtema..." 
          class="w-full"
        />
      </div>
      
      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-4 space-y-4">
        <div v-if="filteredTopics.length === 0" class="text-center py-10 text-gray-500">
          No se encontraron temas o subtemas.
        </div>

        <div v-for="topic in filteredTopics" :key="topic.id" class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800/50">
          <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-800 dark:text-gray-200">
            {{ topic.name }}
          </div>
          <div class="divide-y divide-gray-100 dark:divide-gray-700/50">
            <template v-if="topic.subtopics && topic.subtopics.length > 0">
              <div 
                v-for="sub in topic.subtopics" 
                :key="sub.id" 
                class="px-4 py-3 flex items-center gap-3 transition-colors select-none"
                :class="isAlreadyAdded(topic.id, sub.id) ? 'bg-emerald-50/50 dark:bg-emerald-950/20 opacity-70' : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 cursor-pointer'"
                @click="!isAlreadyAdded(topic.id, sub.id) && toggleSubtopic(topic.id, sub.id)"
              >
                <template v-if="isAlreadyAdded(topic.id, sub.id)">
                  <div class="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center text-white shrink-0">
                    <UIcon name="i-heroicons-check" class="w-3 h-3" />
                  </div>
                  <span class="text-sm text-emerald-700 dark:text-emerald-400 font-medium">{{ sub.name }}</span>
                  <UBadge color="success" variant="subtle" size="xs">Agregado</UBadge>
                </template>
                <template v-else>
                  <UCheckbox :model-value="isSelected(topic.id, sub.id)" @update:model-value="toggleSubtopic(topic.id, sub.id)" @click.stop />
                  <span class="text-sm text-gray-600 dark:text-gray-300 flex-1">{{ sub.name }}</span>
                </template>
              </div>
            </template>
            <template v-else>
              <div class="px-4 py-3 flex items-center gap-3 transition-colors select-none"
                :class="isAlreadyAdded(topic.id, '') ? 'bg-emerald-50/50 dark:bg-emerald-950/20 opacity-70' : 'hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 cursor-pointer'"
                @click="!isAlreadyAdded(topic.id, '') && toggleSubtopic(topic.id, '')"
              >
                <template v-if="isAlreadyAdded(topic.id, '')">
                  <div class="w-4 h-4 rounded bg-emerald-500 flex items-center justify-center text-white shrink-0">
                    <UIcon name="i-heroicons-check" class="w-3 h-3" />
                  </div>
                  <span class="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Sin subtemas (General)</span>
                  <UBadge color="success" variant="subtle" size="xs">Agregado</UBadge>
                </template>
                <template v-else>
                  <UCheckbox :model-value="isSelected(topic.id, '')" @update:model-value="toggleSubtopic(topic.id, '')" @click.stop />
                  <span class="text-sm text-gray-600 dark:text-gray-300 flex-1">Sin subtemas (General)</span>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex justify-between items-center shrink-0">
        <div class="text-sm text-gray-500 dark:text-gray-400">
          <span class="font-semibold text-indigo-600 dark:text-indigo-400">{{ selectedSubtopics.size }}</span> seleccionados
        </div>
        <div class="flex gap-3">
          <UButton color="neutral" variant="soft" @click="close">Cancelar</UButton>
          <UButton color="primary" @click="addSelected" :disabled="selectedSubtopics.size === 0">Agregar al Sílabo</UButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.backdrop-fade-enter-active,
.backdrop-fade-leave-active {
  transition: opacity 200ms ease;
}
.backdrop-fade-enter-from,
.backdrop-fade-leave-to {
  opacity: 0;
}

.slideover-enter-active,
.slideover-leave-active {
  transition: transform 280ms cubic-bezier(0.4, 0, 0.2, 1);
}
.slideover-enter-from,
.slideover-leave-to {
  transform: translateX(100%);
}
</style>
