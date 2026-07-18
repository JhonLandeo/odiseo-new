<!--
  T021 [US2] — MaterialWarning.vue
  Componente de estado vacío / error que se renderiza cuando el Core API
  no tiene suficientes reactivos para los filtros seleccionados.
  Componente presentacional puro: se controla por props y eventos del padre.
-->
<template>
  <div
    v-if="visible"
    class="material-warning"
    role="alert"
    aria-live="polite"
  >
    <div class="material-warning__icon">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="48" height="48">
        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
      </svg>
    </div>

    <div class="material-warning__body">
      <h3 class="material-warning__title">{{ title }}</h3>
      <p class="material-warning__message">{{ message }}</p>
    </div>

    <div class="material-warning__actions">
      <button
        class="material-warning__btn material-warning__btn--retry"
        @click="$emit('retry')"
      >
        Modificar filtros
      </button>
      <button
        class="material-warning__btn material-warning__btn--dismiss"
        @click="dismiss"
      >
        Cerrar
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  title?: string;
  message?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Reactivos insuficientes',
  message: 'No hay suficientes reactivos disponibles para los filtros seleccionados en el Banco de Preguntas global. Intenta modificar el curso, dificultad o temas.',
});

defineEmits<{
  (e: 'retry'): void;
  (e: 'dismiss'): void;
}>();

const visible = ref(true);

function dismiss(): void {
  visible.value = false;
}
</script>

<style scoped>
.material-warning {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px 24px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%);
  border-left: 4px solid #ef6c00;
  box-shadow: 0 2px 12px rgba(239, 108, 0, 0.12);
  animation: slideIn 0.3s ease-out;
}

.material-warning__icon {
  color: #ef6c00;
  flex-shrink: 0;
  margin-top: 2px;
}

.material-warning__body {
  flex: 1;
}

.material-warning__title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  font-weight: 600;
  color: #bf360c;
}

.material-warning__message {
  margin: 0;
  font-size: 0.9rem;
  color: #4e342e;
  line-height: 1.5;
}

.material-warning__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.material-warning__btn {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  transition: all 0.2s ease;
}

.material-warning__btn--retry {
  background: #ef6c00;
  color: #fff;
}
.material-warning__btn--retry:hover {
  background: #e65100;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(239, 108, 0, 0.3);
}

.material-warning__btn--dismiss {
  background: transparent;
  color: #ef6c00;
  border: 1px solid #ef6c00;
}
.material-warning__btn--dismiss:hover {
  background: rgba(239, 108, 0, 0.08);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
