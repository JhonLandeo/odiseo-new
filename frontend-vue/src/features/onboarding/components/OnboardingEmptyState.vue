<template>
  <div class="onboarding-empty-state">
    <!-- Animated illustration container -->
    <div class="empty-icon-ring">
      <div class="empty-icon-inner">
        <UIcon :name="icon" class="empty-icon" />
      </div>
    </div>

    <!-- Text content -->
    <div class="empty-content">
      <h2 class="empty-title">{{ title }}</h2>
      <p class="empty-description">{{ description }}</p>
    </div>

    <!-- Action buttons -->
    <div class="empty-actions">
      <UButton
        color="primary"
        size="lg"
        :loading="isLoadingDemo"
        :disabled="isLoadingDemo"
        class="btn-demo"
        @click="handleSeedDemo"
      >
        <template #leading>
          <UIcon name="i-heroicons-sparkles" />
        </template>
        Cargar datos demo
      </UButton>

      <UButton
        color="neutral"
        variant="ghost"
        size="lg"
        @click="emit('create')"
      >
        <template #leading>
          <UIcon name="i-heroicons-plus" />
        </template>
        Crear {{ createLabel }}
      </UButton>
    </div>

    <!-- Hint text -->
    <p class="empty-hint">
      Los datos demo son temporales. Puedes limpiarlos cuando estés listo para comenzar de verdad.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useOnboardingStore } from '../store/onboarding'
import { useToast } from '#imports'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  icon?: string
  createLabel?: string
}>(), {
  title: 'Aquí verás tu información',
  description: 'Carga datos de demostración para explorar la plataforma, o crea tu primer registro manualmente.',
  icon: 'i-heroicons-academic-cap',
  createLabel: 'registro',
})

const emit = defineEmits<{
  create: []
  demo_loaded: []
}>()

const onboardingStore = useOnboardingStore()
const toast = useToast()
const isLoadingDemo = ref(false)

async function handleSeedDemo() {
  isLoadingDemo.value = true
  try {
    await onboardingStore.seedDemo()
    toast.add({
      title: '¡Datos demo cargados!',
      description: 'Explora la plataforma con datos de ejemplo. Puedes limpiarlos cuando quieras.',
      color: 'success',
      timeout: 4000,
    })
    emit('demo_loaded')
  } catch (e: any) {
    toast.add({
      title: 'Error al cargar datos demo',
      description: e.message,
      color: 'error',
      timeout: 5000,
    })
  } finally {
    isLoadingDemo.value = false
  }
}
</script>

<style scoped>
.onboarding-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  padding: 4rem 2rem;
  text-align: center;
  animation: fade-in-up 0.5s ease-out;
}

@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

.empty-icon-ring {
  width: 5rem;
  height: 5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, hsl(221, 83%, 53% / 0.15), hsl(262, 83%, 58% / 0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse-ring 3s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { box-shadow: 0 0 0 0 hsl(221 83% 53% / 0.3); }
  50%       { box-shadow: 0 0 0 12px hsl(221 83% 53% / 0); }
}

.empty-icon-inner {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 50%;
  background: linear-gradient(135deg, hsl(221, 83%, 53%), hsl(262, 83%, 58%));
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  width: 1.75rem;
  height: 1.75rem;
  color: white;
}

.empty-content {
  max-width: 28rem;
}

.empty-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-slate-800, #1e293b);
  margin-bottom: 0.5rem;
}

:root.dark .empty-title {
  color: var(--color-slate-100, #f1f5f9);
}

.empty-description {
  font-size: 0.9rem;
  color: var(--color-slate-500, #64748b);
  line-height: 1.6;
}

.empty-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}

.btn-demo {
  background: linear-gradient(135deg, hsl(221, 83%, 53%), hsl(262, 83%, 58%)) !important;
  border: none;
  box-shadow: 0 4px 14px hsl(221 83% 53% / 0.35);
  transition: box-shadow 0.2s, transform 0.2s;
}

.btn-demo:hover {
  box-shadow: 0 6px 20px hsl(221 83% 53% / 0.5);
  transform: translateY(-1px);
}

.empty-hint {
  font-size: 0.75rem;
  color: var(--color-slate-400, #94a3b8);
  max-width: 24rem;
}
</style>
