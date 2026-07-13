<template>
  <Transition name="checklist-slide">
    <div
      v-if="!store.isDismissed && store.hasFetched"
      class="checklist-widget"
      :class="{ 'is-minimized': isMinimized }"
    >
      <!-- Header -->
      <div class="checklist-header" @click="toggleMinimize">
        <div class="checklist-header-left">
          <div class="checklist-icon-wrap">
            <UIcon name="i-heroicons-rocket-launch" class="checklist-icon" />
          </div>
          <div>
            <p class="checklist-title">Comencemos tu configuración</p>
            <p class="checklist-subtitle">{{ store.progressPercentage }}% completado</p>
          </div>
        </div>
        <div class="checklist-header-actions">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            :icon="isMinimized ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            class="action-btn"
            @click.stop="toggleMinimize"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-heroicons-x-mark"
            class="action-btn"
            @click.stop="handleDismiss"
          />
        </div>
      </div>

      <!-- Progress Bar -->
      <div class="progress-track">
        <div
          class="progress-fill"
          :style="{ width: `${store.progressPercentage}%` }"
        />
      </div>

      <!-- Steps List (collapsed when minimized) -->
      <Transition name="steps-expand">
        <div v-if="!isMinimized" class="checklist-body">
          <div
            v-for="step in store.availableSteps"
            :key="step.id"
            class="step-item"
            :class="{ 'step-completed': step.completed }"
          >
            <div class="step-check">
              <Transition name="check-pop">
                <UIcon
                  v-if="step.completed"
                  name="i-heroicons-check"
                  class="step-check-icon"
                />
              </Transition>
            </div>
            <span class="step-label">{{ step.label }}</span>
          </div>

          <!-- Completion message -->
          <Transition name="complete-fade">
            <div v-if="store.isComplete" class="completion-banner">
              <UIcon name="i-heroicons-sparkles" class="w-4 h-4" />
              <span>¡Configuración completada!</span>
              <UButton size="xs" color="primary" variant="soft" @click="handleDismiss">
                Finalizar
              </UButton>
            </div>
          </Transition>

          <!-- Skip -->
          <button class="skip-btn" @click="openConfirm">
            Omitir configuración
          </button>
        </div>
      </Transition>
    </div>
  </Transition>

  <!-- Confirmation Modal -->
  <UModal v-model:open="isConfirmOpen">
    <template #content>
      <UCard>
        <div class="p-6 flex flex-col items-center text-center">
          <div class="w-12 h-12 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 ring-8 ring-amber-50/50 dark:ring-amber-900/10">
            <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6" />
          </div>
          <h3 class="text-base font-bold text-slate-900 dark:text-slate-100">
            ¿Omitir la guía de configuración?
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-sm leading-relaxed">
            El checklist se ocultará de la pantalla principal. Puedes reactivarlo o limpiar los datos demo cuando lo desees en la sección de Configuración.
          </p>
          <div class="flex items-center gap-3 w-full mt-6">
            <UButton
              variant="outline"
              color="neutral"
              class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
              @click="closeConfirm"
            >
              Volver
            </UButton>
            <UButton
              color="warning"
              class="flex-1 justify-center rounded-lg py-2 text-xs font-semibold"
              @click="confirmDismiss"
            >
              Confirmar y Omitir
            </UButton>
          </div>
        </div>
      </UCard>
    </template>
  </UModal>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useOnboardingStore } from '../store/onboarding'
import { useToast } from '#imports'

const store = useOnboardingStore()
const toast = useToast()
const isMinimized = ref(false)
const isConfirmOpen = ref(false)

onMounted(async () => {
  if (!store.hasFetched) {
    await store.fetchProgress()
  }
})

function toggleMinimize() {
  isMinimized.value = !isMinimized.value
}

function openConfirm() {
  isConfirmOpen.value = true
}

function closeConfirm() {
  isConfirmOpen.value = false
}

async function confirmDismiss() {
  isConfirmOpen.value = false
  await handleDismiss()
}

async function handleDismiss() {
  try {
    await store.dismissChecklist()
    toast.add({
      title: 'Guía ocultada',
      description: 'Puedes reactivarla desde la configuración de tu institución.',
      color: 'neutral',
      duration: 3000,
    })
  } catch {
    // silently fail
  }
}
</script>

<style scoped>
.checklist-widget {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 50;
  width: 20rem;
  background: white;
  border-radius: 1.25rem;
  border: 1px solid hsl(220 15% 90%);
  box-shadow:
    0 8px 32px hsl(220 40% 20% / 0.12),
    0 2px 8px hsl(220 40% 20% / 0.06);
  overflow: hidden;
  transition: width 0.3s ease;
}

:root.dark .checklist-widget {
  background: hsl(230 20% 18%);
  border-color: hsl(230 15% 28%);
  box-shadow:
    0 8px 32px hsl(230 40% 5% / 0.5),
    0 2px 8px hsl(230 40% 5% / 0.3);
}

.checklist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1rem;
  cursor: pointer;
  user-select: none;
}

.checklist-header-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.checklist-icon-wrap {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.625rem;
  background: linear-gradient(135deg, hsl(221 83% 53%), hsl(262 83% 58%));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.checklist-icon {
  width: 1.125rem;
  height: 1.125rem;
  color: white;
}

.checklist-title {
  font-size: 0.8125rem;
  font-weight: 700;
  color: hsl(222 47% 18%);
  line-height: 1;
  margin-bottom: 0.125rem;
}

:root.dark .checklist-title {
  color: hsl(210 40% 96%);
}

.checklist-subtitle {
  font-size: 0.6875rem;
  color: hsl(220 14% 60%);
}

.checklist-header-actions {
  display: flex;
  gap: 0.25rem;
}

.action-btn {
  opacity: 0.6;
  transition: opacity 0.15s;
}
.action-btn:hover { opacity: 1; }

/* Progress bar */
.progress-track {
  height: 3px;
  background: hsl(220 15% 92%);
}

:root.dark .progress-track {
  background: hsl(230 15% 25%);
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, hsl(221 83% 53%), hsl(262 83% 58%));
  transition: width 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}

/* Body */
.checklist-body {
  padding: 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

/* Steps */
.step-item {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

.step-check {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: 2px solid hsl(220 15% 80%);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s, border-color 0.3s;
}

:root.dark .step-check {
  border-color: hsl(230 15% 40%);
}

.step-completed .step-check {
  background: hsl(142 76% 36%);
  border-color: hsl(142 76% 36%);
}

.step-check-icon {
  width: 0.75rem;
  height: 0.75rem;
  color: white;
}

.step-label {
  font-size: 0.8rem;
  color: hsl(222 20% 30%);
  transition: color 0.2s;
}

:root.dark .step-label {
  color: hsl(210 20% 70%);
}

.step-completed .step-label {
  color: hsl(220 15% 55%);
  text-decoration: line-through;
  text-decoration-color: hsl(220 15% 70%);
}

/* Completion banner */
.completion-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: hsl(142 76% 36% / 0.1);
  border: 1px solid hsl(142 76% 36% / 0.2);
  border-radius: 0.625rem;
  font-size: 0.75rem;
  color: hsl(142 76% 30%);
  margin-top: 0.25rem;
}

:root.dark .completion-banner {
  background: hsl(142 76% 36% / 0.15);
  color: hsl(142 76% 60%);
}

/* Skip button */
.skip-btn {
  font-size: 0.7rem;
  color: hsl(220 15% 60%);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: 0;
  margin-top: 0.25rem;
  transition: color 0.15s;
}

.skip-btn:hover {
  color: hsl(220 15% 40%);
}

/* Transitions */
.checklist-slide-enter-active,
.checklist-slide-leave-active {
  transition: opacity 0.3s, transform 0.3s;
}
.checklist-slide-enter-from,
.checklist-slide-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

.steps-expand-enter-active,
.steps-expand-leave-active {
  transition: opacity 0.25s, max-height 0.3s;
  overflow: hidden;
  max-height: 300px;
}
.steps-expand-enter-from,
.steps-expand-leave-to {
  opacity: 0;
  max-height: 0;
}

.check-pop-enter-active {
  animation: check-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes check-pop {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

.complete-fade-enter-active,
.complete-fade-leave-active {
  transition: opacity 0.4s, transform 0.4s;
}
.complete-fade-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
</style>
