<template>
  <div class="min-h-screen flex items-center justify-center px-6 py-12 bg-white dark:bg-[#12121a] transition-colors duration-500">
    <div class="w-full max-w-md">

      <!-- Brand mark -->
      <div class="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg mb-6 border border-slate-100 dark:border-slate-800"
           :style="{ backgroundColor: themeColor }">
        <span class="text-white text-xl font-black">O</span>
      </div>

      <!-- Why the user is here. A held user did not choose to come to this page. -->
      <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 mb-4 border border-amber-200 dark:border-amber-800/50">
        <span class="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        <span class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
          Acción requerida
        </span>
      </div>

      <h2 class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-3">
        Actualiza tu contraseña
      </h2>
      <p class="text-slate-500 dark:text-slate-400 text-sm font-medium leading-relaxed mb-8">
        Tu cuenta fue creada con una contraseña temporal, o un administrador la restableció.
        Por seguridad, debes elegir una contraseña nueva antes de continuar. Mientras tanto, el
        resto de la plataforma permanece bloqueado.
      </p>

      <form class="space-y-5" @submit.prevent="handleSubmit">

        <!-- Current password -->
        <div class="group relative">
          <label
            for="currentPassword"
            class="absolute -top-2 left-3 inline-block px-1 bg-white dark:bg-[#12121a] text-xs font-semibold text-slate-500 dark:text-slate-400 z-10"
          >
            Contraseña actual
          </label>
          <input
            id="currentPassword"
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required
            placeholder="••••••••"
            class="block w-full px-4 py-3.5 bg-transparent border-2 border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none transition-all"
          />
        </div>

        <!-- New password -->
        <div class="group relative">
          <label
            for="newPassword"
            class="absolute -top-2 left-3 inline-block px-1 bg-white dark:bg-[#12121a] text-xs font-semibold text-slate-500 dark:text-slate-400 z-10"
          >
            Contraseña nueva
          </label>
          <input
            id="newPassword"
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
            placeholder="••••••••"
            class="block w-full px-4 py-3.5 bg-transparent border-2 border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none transition-all"
          />
          <p class="mt-2 text-xs font-medium text-slate-400 dark:text-slate-500">
            Mínimo {{ PASSWORD_MIN_LENGTH }} caracteres y distinta de la actual.
          </p>
        </div>

        <!-- Confirm new password -->
        <div class="group relative">
          <label
            for="confirmPassword"
            class="absolute -top-2 left-3 inline-block px-1 bg-white dark:bg-[#12121a] text-xs font-semibold text-slate-500 dark:text-slate-400 z-10"
          >
            Confirma la contraseña nueva
          </label>
          <input
            id="confirmPassword"
            v-model="confirmPassword"
            type="password"
            autocomplete="new-password"
            required
            placeholder="••••••••"
            class="block w-full px-4 py-3.5 bg-transparent border-2 border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none transition-all"
          />
        </div>

        <!-- Error alert -->
        <Transition name="fade-slide">
          <div
            v-if="error"
            data-testid="change-password-error"
            class="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30"
          >
            <svg class="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
            </svg>
            <p class="text-sm font-medium text-red-700 dark:text-red-400">{{ error }}</p>
          </div>
        </Transition>

        <!-- Submit -->
        <button
          type="submit"
          :disabled="loading || !currentPassword || !newPassword || !confirmPassword"
          class="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-black/5 disabled:opacity-50 disabled:pointer-events-none mt-4"
          :style="{ backgroundColor: themeColor }"
        >
          <svg v-if="loading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {{ loading ? 'Guardando...' : 'Guardar y continuar' }}
        </button>
      </form>

      <!-- A held user must always be able to leave. -->
      <div class="flex justify-center pt-6">
        <button
          type="button"
          data-testid="change-password-logout"
          class="text-xs font-semibold text-slate-500 dark:text-slate-400 hover:underline transition-colors"
          @click="handleLogout"
        >
          Cerrar sesión
        </button>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore, PASSWORD_MIN_LENGTH, type ChangePasswordResult } from '@/stores/auth.store';
import { resolveLandingPath } from '@/middleware/auth.global';
import { useRouter } from 'vue-router';

/**
 * Deliberately standalone (`layout: false`) rather than the `b2b` layout.
 *
 * While the hold is active the backend 403s every endpoint except me/logout/
 * change-password, so the b2b sidebar would render a full navigation tree whose
 * every link is a dead end, plus widgets whose data requests all fail. A focused
 * single-purpose screen — the same shape as `login.vue` — is the honest one.
 */
definePageMeta({ layout: false });

const authStore = useAuthStore();
const router = useRouter();

const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const loading = ref(false);
const error = ref('');

const themeColor = computed(() => authStore.branding?.primaryColor || '#3b82f6');

/** Backend failure reasons mapped to distinct, actionable Spanish copy. */
const ERROR_MESSAGES: Record<Exclude<ChangePasswordResult, { ok: true }>['reason'], string> = {
  'invalid-current-password': 'La contraseña actual no es correcta.',
  'weak-password': `La contraseña nueva no cumple los requisitos: mínimo ${PASSWORD_MIN_LENGTH} caracteres y debe ser distinta de la actual.`,
  'rate-limited': 'Demasiados intentos. Espera un minuto antes de volver a intentarlo.',
  unknown: 'No pudimos actualizar tu contraseña. Inténtalo de nuevo.',
};

async function handleSubmit() {
  error.value = '';

  // Client-side checks that mirror the backend exactly — no stricter policy
  // here, or the UI would reject passwords the server accepts.
  if (newPassword.value.length < PASSWORD_MIN_LENGTH) {
    error.value = `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
    return;
  }
  if (newPassword.value === currentPassword.value) {
    error.value = 'La contraseña nueva debe ser distinta de la actual.';
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    error.value = 'Las contraseñas no coinciden.';
    return;
  }

  loading.value = true;
  const result = await authStore.changePassword(currentPassword.value, newPassword.value);
  loading.value = false;

  if (!result.ok) {
    error.value = ERROR_MESSAGES[result.reason];
    return;
  }

  // Send the user where a normal login would have put them, reusing the
  // middleware's landing table instead of hardcoding a destination.
  router.push(resolveLandingPath(authStore) ?? '/');
}

async function handleLogout() {
  await authStore.logout();
}
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.fade-slide-enter-from,
.fade-slide-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

input:focus {
  border-color: v-bind('themeColor') !important;
}
</style>
