<template>
  <div v-if="!isInitialized" class="min-h-screen flex items-center justify-center bg-white dark:bg-[#12121a]">
    <div class="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
  </div>
  <div v-else class="min-h-screen flex relative overflow-hidden bg-white dark:bg-[#12121a] transition-colors duration-500">

    <!-- LEFT PANEL: Dynamic Storytelling & Floating Cards -->
    <div 
      class="hidden lg:flex lg:w-[55%] relative flex-col justify-center items-center p-20 overflow-hidden"
      :class="isSystemTenant ? 'bg-[#0f172a]' : 'bg-[#f8fafc] dark:bg-[#1a1b26]'"
    >
      <!-- Background Grid & Gradients -->
      <div class="absolute inset-0 opacity-[0.04] dark:opacity-[0.02]" 
           style="background-image: radial-gradient(#000 1px, transparent 1px); background-size: 32px 32px;" />
      
      <!-- Huge Ambient Glows -->
      <div class="absolute top-0 right-0 w-[800px] h-[800px] rounded-full blur-[120px] opacity-30 mix-blend-multiply dark:mix-blend-lighten pointer-events-none translate-x-1/3 -translate-y-1/3" 
           :style="{ backgroundColor: themeColor }" />
      <div class="absolute bottom-0 left-0 w-[600px] h-[600px] rounded-full blur-[100px] opacity-20 mix-blend-multiply dark:mix-blend-lighten pointer-events-none -translate-x-1/4 translate-y-1/4" 
           style="background-color: #8b5cf6;" />

      <div class="relative z-10 w-full max-w-2xl">
        <!-- System Admin View -->
        <template v-if="isSystemTenant">
          <div class="mb-12">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md mb-8">
              <span class="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              <span class="text-xs font-semibold tracking-widest text-indigo-300 uppercase">Odiseo SaaS Master Control</span>
            </div>
            <h1 class="text-6xl font-black text-white tracking-tighter leading-[1.1] mb-6">
              Escala el futuro <br />
              <span class="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-300% animate-gradient">
                de la educación.
              </span>
            </h1>
            <p class="text-xl text-slate-400 font-medium leading-relaxed max-w-lg">
              Monitorea el crecimiento de cada colegio, gestiona infraestructuras de PDF y asegura la estabilidad global del sistema.
            </p>
          </div>
        </template>

        <!-- Client Tenant View (The Student Success Story) -->
        <template v-else>
          <div class="mb-12">
            <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm mb-8">
              <UIcon name="i-heroicons-academic-cap" class="w-4 h-4" :style="{ color: themeColor }" />
              <span class="text-xs font-bold tracking-widest text-slate-600 dark:text-slate-300 uppercase">Gestión Académica de Éxito</span>
            </div>
            <h1 class="text-6xl font-black text-slate-900 dark:text-white tracking-tighter leading-[1.1] mb-6">
              De las aulas, <br />
              <span class="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-500" :style="{ backgroundImage: `linear-gradient(to right, ${themeColor}, #8b5cf6)` }">
                a la Universidad.
              </span>
            </h1>
            <p class="text-xl text-slate-600 dark:text-slate-400 font-medium leading-relaxed max-w-lg">
              Genera material perfecto en PDF, consolida bancos de preguntas y asegura el ingreso de tus alumnos a las mejores universidades del país.
            </p>
          </div>

          <!-- Floating Story Cards (Bento/Floating UI) -->
          <div class="relative h-[280px] w-full mt-12 perspective-1000">
            
            <!-- Floating Card 1: Generated PDF -->
            <div class="absolute top-0 left-0 w-64 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 animate-float-slow z-20 transform -rotate-3 hover:rotate-0 transition-transform cursor-default">
              <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
                </div>
                <div>
                  <p class="text-sm font-bold text-slate-900 dark:text-white">Simulacro_UNI.pdf</p>
                  <p class="text-xs text-slate-500">Generado hace 2 min</p>
                </div>
              </div>
              <div class="space-y-2">
                <div class="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full"></div>
                <div class="h-2 w-4/5 bg-slate-100 dark:bg-slate-700 rounded-full"></div>
                <div class="h-2 w-full bg-slate-100 dark:bg-slate-700 rounded-full"></div>
              </div>
            </div>

            <!-- Floating Card 2: Admission Success -->
            <div class="absolute top-12 right-4 w-56 bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-xl border border-slate-100 dark:border-slate-700 animate-float-medium z-30 transform rotate-6 hover:rotate-0 transition-transform cursor-default" style="animation-delay: -2s;">
              <div class="flex items-center gap-3">
                <div class="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center border-4 border-white dark:border-slate-800 shadow-sm relative z-10 shrink-0">
                  <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400">🎓</span>
                </div>
                <div>
                  <p class="text-sm font-bold text-slate-900 dark:text-white">¡Ingreso Logrado!</p>
                  <p class="text-xs text-slate-500">Medicina, UNMSM</p>
                </div>
              </div>
            </div>

            <!-- Floating Card 3: Question Bank -->
            <div class="absolute bottom-4 left-1/4 w-72 bg-white/80 dark:bg-slate-800/80 backdrop-blur-md p-4 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 animate-float-fast z-10 cursor-default" style="animation-delay: -4s;">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Banco de Preguntas</p>
                  <p class="text-2xl font-black text-slate-900 dark:text-white mt-1">+12,450</p>
                </div>
                <div class="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/20" :style="{ color: themeColor }">
                  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                </div>
              </div>
            </div>

          </div>
        </template>
      </div>

      <!-- Footer Info on Left Panel -->
      <div class="absolute bottom-8 left-20 right-20 flex items-center justify-between text-sm font-medium z-10"
           :class="isSystemTenant ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'">
        <p>&copy; {{ new Date().getFullYear() }} Odiseo B2B. Todos los derechos reservados.</p>
        <p v-if="!isSystemTenant">Powered by Odiseo SaaS</p>
      </div>
    </div>

    <!-- RIGHT PANEL: Minimalist Login Form -->
    <div class="flex-1 flex flex-col justify-center items-center px-6 sm:px-12 lg:px-24 py-12 relative z-20 bg-white dark:bg-[#12121a]">
      
      <!-- Theme Toggle -->
      <button 
        @click="toggleTheme"
        class="absolute top-8 right-8 p-2.5 rounded-full bg-slate-50 dark:bg-slate-800/50 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-700/50"
      >
        <svg v-if="isDark" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
        <svg v-else class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
      </button>

      <div class="w-full max-w-sm">
        
        <!-- Mobile Logo & Title -->
        <div class="mb-10 lg:mb-12">
          <div class="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg mb-6 border border-slate-100 dark:border-slate-800" 
               :style="{ backgroundColor: themeColor }">
            <span class="text-white text-xl font-black">O</span>
          </div>
          
          <div v-if="isBrandingLoading" class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 mb-4 border border-slate-200 dark:border-slate-700">
            <span class="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse" />
            <span class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Cargando...</span>
          </div>
          <div v-else class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-50 dark:bg-slate-800 mb-4 border border-slate-200 dark:border-slate-700">
            <span class="w-2 h-2 rounded-full" :class="isSystemTenant ? 'bg-indigo-500' : 'bg-emerald-500'" />
            <span class="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
              {{ isSystemTenant ? 'Odiseo Super Admin' : (branding?.commercialName || 'Colegio Afiliado') }}
            </span>
          </div>

          <h2 class="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight mb-2">Ingresa a tu cuenta</h2>
          <p class="text-slate-500 dark:text-slate-400 text-sm font-medium">
            Por favor, escribe tus credenciales para continuar.
          </p>
        </div>

        <!-- Minimalist Form -->
        <form class="space-y-5" @submit.prevent="handleLogin">
          
          <!-- Email Input -->
          <div class="group relative">
            <label for="email" class="absolute -top-2 left-3 inline-block px-1 bg-white dark:bg-[#12121a] text-xs font-semibold text-slate-500 dark:text-slate-400 z-10 transition-colors group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400"
                   :style="{ color: email ? themeColor : '' }">
              Correo Electrónico
            </label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              class="block w-full px-4 py-3.5 bg-transparent border-2 border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none transition-all"
              :style="focusStyle"
              :placeholder="isSystemTenant ? 'ej. admin@odiseo.com' : 'ej. director@colegio.edu'"
            />
          </div>

          <!-- Password Input -->
          <div class="group relative">
            <label for="password" class="absolute -top-2 left-3 inline-block px-1 bg-white dark:bg-[#12121a] text-xs font-semibold text-slate-500 dark:text-slate-400 z-10 transition-colors group-focus-within:text-indigo-600 dark:group-focus-within:text-indigo-400"
                   :style="{ color: password ? themeColor : '' }">
              Contraseña
            </label>
            <input
              id="password"
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              required
              placeholder="••••••••"
              class="block w-full px-4 py-3.5 bg-transparent border-2 border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-white placeholder-slate-300 dark:placeholder-slate-700 focus:outline-none transition-all pr-12"
              :style="focusStyle"
            />
            <button
              type="button"
              class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              @click="showPassword = !showPassword"
            >
              <svg v-if="!showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21"/></svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
          </div>
          
          <div class="flex justify-end pt-1">
            <a href="#" class="text-xs font-semibold hover:underline transition-colors" :style="{ color: themeColor }">¿Problemas para acceder?</a>
          </div>

          <!-- Error Alert -->
          <Transition name="fade-slide">
            <div v-if="error" class="flex items-center gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
              <svg class="w-5 h-5 text-red-500 dark:text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <p class="text-sm font-medium text-red-700 dark:text-red-400">{{ error }}</p>
            </div>
          </Transition>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="loading || !email || !password"
            class="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-xl text-sm font-bold text-white transition-all shadow-lg shadow-black/5 disabled:opacity-50 disabled:pointer-events-none mt-4"
            :style="{ backgroundColor: themeColor }"
            :class="!loading && 'hover:brightness-110 hover:-translate-y-0.5 active:scale-95'"
          >
            <svg v-if="loading" class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {{ loading ? 'Iniciando sesión...' : 'Ingresar al Dashboard' }}
            <svg v-if="!loading" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
          </button>
        </form>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import { useColorMode } from '#imports';

definePageMeta({ layout: false });

const authStore = useAuthStore();
const { branding } = storeToRefs(authStore);
const router = useRouter();
const colorMode = useColorMode();

const email = ref('');
const password = ref('');
const loading = ref(false);
const error = ref('');
const showPassword = ref(false);
const isBrandingLoading = ref(false);
const subdomain = ref('');
const isInitialized = ref(false);

// Theming & Dynamic Layout
const isSystemTenant = computed(() => subdomain.value === 'odiseo');
const isDark = computed(() => colorMode.value === 'dark');

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

const themeColor = computed(() => {
  if (isSystemTenant.value) return '#6366f1'; // Indigo-500 for Super Admin
  return branding.value?.primaryColor || '#3b82f6'; // Blue-500 fallback
});

const themeColorShadow = computed(() => themeColor.value + '40'); // 25% opacity hex

// Minimalist Floating Focus Style
const focusStyle = computed(() => {
  if (error.value) {
    return 'border-color: #ef4444;';
  }
  return `focus:border-color: ${themeColor.value};`;
});

onMounted(async () => {
  subdomain.value = authStore.getSubdomain();
  isInitialized.value = true;

  isBrandingLoading.value = true;
  try {
    await authStore.fetchBranding(subdomain.value);
  } finally {
    isBrandingLoading.value = false;
  }
});

async function handleLogin() {
  loading.value = true;
  error.value = '';

  const success = await authStore.login(
    { email: email.value, password: password.value },
    subdomain.value
  );

  loading.value = false;
  if (success) {
    if (isSystemTenant.value) {
      router.push('/admin/dashboard');
    } else {
      router.push('/materials');
    }
  } else {
    error.value = 'Credenciales inválidas o acceso denegado.';
  }
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

/* Fix dynamic focus ring with a global style injection via JS instead of pure CSS to support hex codes */
input:focus {
  border-color: v-bind('themeColor') !important;
  box-shadow: 0 0 0 4px v-bind('themeColorShadow') !important;
}

/* Animations for Floating Cards */
@keyframes float-slow {
  0% { transform: translateY(0px) rotate(-3deg); }
  50% { transform: translateY(-15px) rotate(-2deg); }
  100% { transform: translateY(0px) rotate(-3deg); }
}
@keyframes float-medium {
  0% { transform: translateY(0px) rotate(6deg); }
  50% { transform: translateY(-20px) rotate(8deg); }
  100% { transform: translateY(0px) rotate(6deg); }
}
@keyframes float-fast {
  0% { transform: translateY(0px) scale(1); }
  50% { transform: translateY(-10px) scale(1.02); }
  100% { transform: translateY(0px) scale(1); }
}

.animate-float-slow {
  animation: float-slow 8s ease-in-out infinite;
}
.animate-float-medium {
  animation: float-medium 6s ease-in-out infinite;
}
.animate-float-fast {
  animation: float-fast 4s ease-in-out infinite;
}

.bg-300\% {
  background-size: 300% auto;
}

@keyframes gradient {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.animate-gradient {
  animation: gradient 6s ease infinite;
}
</style>
