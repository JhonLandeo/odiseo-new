<template>
  <div class="flex h-screen w-full font-sans overflow-hidden bg-slate-50 dark:bg-[#1e1e2d] transition-colors duration-300">
    
    <!-- Mobile Overlay -->
    <div 
      v-if="isMobileOpen"
      class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-30 lg:hidden transition-opacity"
      @click="isMobileOpen = false"
    />

    <!-- Sidebar -->
    <aside
      class="
        bg-white dark:bg-[#2b2b3f]
        border-slate-200 dark:border-slate-700/50 border-r
        transition-all duration-300 ease-in-out
        flex flex-col h-screen fixed lg:sticky top-0 z-40
      "
      :class="[
        isSidebarOpen ? 'w-64' : 'w-20',
        isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      ]"
    >
      <!-- Brand Header -->
      <div class="h-20 flex items-center border-slate-200 dark:border-slate-700/50 border-b shrink-0" :class="isSidebarOpen ? 'px-6' : 'justify-center'">
        <div class="flex items-center gap-3" :class="!isSidebarOpen ? 'justify-center' : ''">
          <div class="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/30 shrink-0">
            <span class="font-black text-xl">O</span>
          </div>
          <div v-if="isSidebarOpen" class="flex flex-col overflow-hidden whitespace-nowrap">
            <span class="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-200 truncate">
              Odiseo <span class="text-indigo-600 dark:text-indigo-400">Admin</span>
            </span>
            <span class="text-[10px] uppercase tracking-wider text-slate-500 truncate">SaaS Management</span>
          </div>
        </div>
      </div>

      <!-- Navigation Links -->
      <div class="flex-1 overflow-y-auto py-6 custom-scrollbar">
        <nav class="px-3 space-y-1">
          <template v-for="(item, index) in navigationData" :key="index">
            <div class="mb-1">
              <NuxtLink
                :to="item.path"
                class="
                  flex items-center justify-between px-3 py-2.5 rounded-lg
                  transition-colors duration-200 group outline-none
                  hover:bg-slate-100 dark:hover:bg-[#36364e]
                "
                :class="isRouteActive(item.path)
                  ? 'bg-indigo-50 text-indigo-700 dark:bg-[#36364e] dark:text-indigo-300 font-semibold'
                  : 'text-slate-500 dark:text-slate-400 font-medium'"
                @click="isMobileOpen = false"
              >
                <div class="flex items-center gap-3 overflow-hidden">
                  <UIcon :name="item.icon" class="w-5 h-5 shrink-0 transition-colors" :class="isRouteActive(item.path) ? '' : 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400'" />
                  <span v-if="isSidebarOpen" class="text-sm truncate">{{ item.name }}</span>
                </div>
              </NuxtLink>
            </div>
          </template>
        </nav>
      </div>

      <!-- System Status Card -->
      <div v-if="isSidebarOpen" class="px-4 py-4">
        <div class="p-4 rounded-2xl relative overflow-hidden group bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-500/20">
          <div class="absolute -right-4 -top-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div class="flex items-start gap-3 relative z-10">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <UIcon name="i-heroicons-server" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-800 dark:text-slate-200">System Core</h4>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">Sistemas operativos</p>
              <div class="w-full h-1.5 rounded-full bg-white dark:bg-[#1e1e2d]">
                <div class="w-full h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="px-3 py-4 flex justify-center">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center cursor-pointer hover:shadow-lg hover:shadow-indigo-500/30 transition-all">
          <UIcon name="i-heroicons-server" class="w-5 h-5" />
        </div>
      </div>

      <!-- User Profile Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-700/50 shrink-0 flex items-center" :class="isSidebarOpen ? 'justify-between' : 'justify-center'">
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="relative shrink-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-white border-2 border-transparent hover:border-indigo-500 transition-colors cursor-pointer">
              <span class="text-xs font-bold">SA</span>
            </div>
            <div class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#2b2b3f] rounded-full"></div>
          </div>
          
          <div v-if="isSidebarOpen" class="flex flex-col truncate">
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">Super Admin</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 truncate">SaaS Management</span>
          </div>
        </div>
        
        <button v-if="isSidebarOpen" class="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors shrink-0">
          <UIcon name="i-heroicons-arrow-right-on-rectangle" class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col h-screen overflow-hidden">
      <!-- Top Header -->
      <header class="h-20 bg-white dark:bg-[#2b2b3f] border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between px-6 shrink-0 z-30 transition-colors duration-300">
        <div class="flex items-center gap-4">
          <button 
            @click="isMobileOpen = !isMobileOpen"
            class="lg:hidden p-2 rounded-lg text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors"
          >
            <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
          </button>
          
          <button 
            @click="isSidebarOpen = !isSidebarOpen"
            class="hidden lg:flex p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors"
          >
            <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
          </button>

          <!-- Command Palette Hint -->
          <div 
            class="hidden md:flex items-center px-4 py-2 rounded-full bg-slate-100 dark:bg-[#1e1e2d] w-64 lg:w-96 transition-all hover:ring-2 hover:ring-indigo-500/50 cursor-pointer text-slate-500 dark:text-slate-400"
          >
            <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 shrink-0" />
            <span class="ml-3 text-sm flex-1 truncate text-slate-400">Buscar tenants, planes...</span>
            <kbd class="ml-1 flex gap-0.5 shrink-0">
              <span class="inline-flex h-4 items-center rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-1 text-[10px] text-slate-500 dark:text-slate-400">⌘K</span>
            </kbd>
          </div>
        </div>

        <div class="flex items-center gap-3 lg:gap-4">
          <!-- Theme Toggle -->
          <button 
            @click="toggleTheme"
            class="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors"
          >
            <UIcon :name="isDark ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="w-5 h-5" />
          </button>

          <!-- Notifications -->
          <button class="relative p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors">
            <UIcon name="i-heroicons-bell" class="w-5 h-5" />
            <span class="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border border-white dark:border-[#2b2b3f]"></span>
          </button>
          
          <!-- Quick Action Button -->
          <button class="hidden md:flex items-center gap-2 bg-slate-800 hover:bg-slate-900 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-indigo-600/20">
            <span class="text-lg leading-none mb-0.5">+</span> Acciones
          </button>
        </div>
      </header>

      <!-- Dashboard Content View (Nuxt Page) -->
      <div class="flex-1 overflow-auto custom-scrollbar relative">
        <div class="p-6 md:p-8 max-w-[1600px] mx-auto">
          <slot />
        </div>
      </div>
    </main>

  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useColorMode } from '#imports';

const route = useRoute();
const colorMode = useColorMode();

// Layout State
const isSidebarOpen = ref(true);
const isMobileOpen = ref(false);

const isDark = computed(() => colorMode.value === 'dark');

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function isRouteActive(path: string) {
  if (path === '#' || path === '/') return route.path === '/admin';
  return route.path.startsWith(path);
}

// Navigation Structure mapping to existing Odiseo routes
const navigationData = [
  { name: 'Dashboard', icon: 'i-heroicons-home', path: '/admin/dashboard' },
  { name: 'Empresas (Tenants)', icon: 'i-heroicons-building-office-2', path: '/admin/tenants' },
  { name: 'Suscripciones', icon: 'i-heroicons-credit-card', path: '/admin/subscriptions' },
];
</script>

<style>
/* Custom Scrollbar for the dark theme compatibility */
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 20px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #94a3b8;
}

html.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #475569;
}
html.dark .custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: #64748b;
}
</style>
