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
              Odiseo <span class="text-indigo-600 dark:text-indigo-400">B2B</span>
            </span>
            <span class="text-[10px] uppercase tracking-wider text-slate-500 truncate">{{ tenantName }}</span>
          </div>
        </div>
      </div>

      <!-- Navigation Links -->
      <div class="flex-1 overflow-y-auto py-6 custom-scrollbar">
        <nav class="px-3 space-y-1">
          <template v-for="(item, index) in navigationData" :key="index">
            <div class="mb-1">
              <!-- Item WITH Submenu -->
              <template v-if="item.items && item.items.length > 0">
                <button
                  :id="item.menuKey ? 'menu-' + item.menuKey : undefined"
                  :aria-expanded="!!expandedMenus[item.menuKey]"
                  @click="handleMenuToggle(item.menuKey)"
                  class="
                    w-full flex items-center justify-between px-3 py-2.5 rounded-lg
                    transition-colors duration-200 group outline-none
                    hover:bg-slate-100 dark:hover:bg-[#36364e]
                  "
                  :class="(expandedMenus[item.menuKey] && isSidebarOpen) ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'"
                >
                  <div class="flex items-center gap-3 overflow-hidden">
                    <UIcon :name="item.icon" class="w-5 h-5 shrink-0 transition-colors" :class="(expandedMenus[item.menuKey] && isSidebarOpen) ? 'text-indigo-600 dark:text-indigo-400' : 'text-current group-hover:text-indigo-600 dark:group-hover:text-indigo-400'" />
                    <span v-if="isSidebarOpen" class="font-medium text-sm truncate">{{ item.name }}</span>
                  </div>
                  <UIcon v-if="isSidebarOpen" name="i-heroicons-chevron-down" class="w-4 h-4 shrink-0 transition-transform duration-200" :class="expandedMenus[item.menuKey] ? 'rotate-180' : ''" />
                </button>

                <!-- Submenu Dropdown -->
                <div
                  class="overflow-hidden transition-all duration-300 ease-in-out"
                  :style="{ maxHeight: (expandedMenus[item.menuKey] && isSidebarOpen) ? '400px' : '0' }"
                >
                  <div class="pl-11 pr-3 py-2 space-y-1 relative" :class="(expandedMenus[item.menuKey] && isSidebarOpen) ? 'mt-1' : ''">
                    <!-- Connecting Line -->
                    <div class="absolute left-[27px] top-0 bottom-6 w-px border-l border-slate-200 dark:border-slate-700/50"></div>
                    
                    <div v-for="(subItem, subIndex) in item.items" :key="subIndex" class="relative group">
                      <!-- Connector dot -->
                      <div class="absolute left-[-20px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full z-10 transition-colors"
                          :class="isRouteActive(subItem.path) ? 'bg-indigo-500' : 'bg-transparent group-hover:bg-slate-300 dark:group-hover:bg-slate-600'"
                      ></div>

                      <NuxtLink
                        :to="subItem.path"
                        class="flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors"
                        :class="isRouteActive(subItem.path) 
                          ? 'bg-indigo-50 text-indigo-700 dark:bg-[#36364e] dark:text-indigo-300 font-semibold' 
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] font-medium'"
                        @click="isMobileOpen = false"
                      >
                        <span class="truncate">{{ subItem.name }}</span>
                        <span v-if="subItem.badge" class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full"
                          :class="isRouteActive(subItem.path) ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300' : 'bg-slate-200 text-slate-600 dark:bg-[#1e1e2d] dark:text-slate-400'">
                          {{ subItem.badge }}
                        </span>
                      </NuxtLink>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Single Item WITHOUT Submenu -->
              <template v-else>
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
                  <span v-if="isSidebarOpen && item.badge" class="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 dark:bg-[#1e1e2d] dark:text-slate-400">
                    {{ item.badge }}
                  </span>
                </NuxtLink>
              </template>
            </div>
          </template>
        </nav>
      </div>

      <!-- Upgrade Plan Card -->
      <div v-if="isSidebarOpen" class="px-4 py-4">
        <div class="p-4 rounded-2xl relative overflow-hidden group bg-indigo-50 border border-indigo-100 dark:bg-indigo-950/30 dark:border-indigo-500/20">
          <div class="absolute -right-4 -top-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>
          <div class="flex items-start gap-3 relative z-10">
            <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center shrink-0 shadow-md">
              <UIcon name="i-heroicons-sparkles" class="w-5 h-5" />
            </div>
            <div>
              <h4 class="text-sm font-semibold text-slate-800 dark:text-slate-200">Plan Pro Activo</h4>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-3">Estudiantes ilimitados</p>
              <div class="w-full h-1.5 rounded-full bg-white dark:bg-[#1e1e2d]">
                <div class="w-2/3 h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="px-3 py-4 flex justify-center">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white flex items-center justify-center cursor-pointer hover:shadow-lg hover:shadow-indigo-500/30 transition-all">
          <UIcon name="i-heroicons-sparkles" class="w-5 h-5" />
        </div>
      </div>

      <!-- User Profile Footer -->
      <div class="p-4 border-t border-slate-200 dark:border-slate-700/50 shrink-0 flex items-center" :class="isSidebarOpen ? 'justify-between' : 'justify-center'">
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="relative shrink-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white border-2 border-transparent hover:border-indigo-500 transition-colors cursor-pointer">
              <span class="text-xs font-bold">{{ userInitials }}</span>
            </div>
            <div class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-[#2b2b3f] rounded-full"></div>
          </div>
          
          <div v-if="isSidebarOpen" class="flex flex-col truncate">
            <span class="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{{ userName }}</span>
            <span class="text-xs text-slate-500 dark:text-slate-400 truncate">Administrador</span>
          </div>
        </div>
        
        <button v-if="isSidebarOpen" @click="handleLogout" class="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors shrink-0">
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
            @click="openCommandPalette"
          >
            <UIcon name="i-heroicons-magnifying-glass" class="w-4 h-4 shrink-0" />
            <span class="ml-3 text-sm flex-1 truncate text-slate-400">Buscar estudiantes, ciclos...</span>
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
          <button @click="openCommandPalette" class="hidden md:flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm shadow-indigo-600/20">
            <span class="text-lg leading-none mb-0.5">+</span> Acciones
          </button>
        </div>
      </header>

      <!-- Soft Limit Warning Banner (Mock for Admins) -->
      <div v-if="userName === 'Director' && isGracePeriod" class="bg-amber-500 shrink-0 px-4 py-2 flex items-center justify-center gap-3">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-amber-900 shrink-0" />
        <p class="text-sm font-medium text-amber-900">
          Su colegio ha excedido los límites del plan. Tiene un periodo de gracia de 3 días antes de suspenderse el servicio. Por favor, contacte a soporte para actualizar su suscripción.
        </p>
      </div>

      <!-- Dashboard Content View (Nuxt Page) -->
      <div class="flex-1 overflow-auto custom-scrollbar relative">
        <div class="p-6 md:p-8 max-w-[1600px] mx-auto">
          <slot />
        </div>
      </div>
    </main>
    
    <AppTour />
    <GlobalHelperWidget />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { useRoute } from 'vue-router';
import { useColorMode } from '#imports';
import AppTour from '@/features/onboarding/components/AppTour.vue';
import GlobalHelperWidget from '@/components/GlobalHelperWidget.vue';

const authStore = useAuthStore();
const route = useRoute();
const colorMode = useColorMode();

const tenantName = computed(() => authStore.branding?.commercialName || 'Odiseo Academy');
const userName = computed(() => authStore.user?.name || 'Director');
const userInitials = computed(() => {
  const name = userName.value;
  return name ? name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'O';
});

// Mock state for grace period (would normally come from authStore/tenant context)
const isGracePeriod = ref(true);

// Layout State
const isSidebarOpen = ref(true);
const isMobileOpen = ref(false);
const expandedMenus = ref<Record<string, boolean>>({
  academics: true,
  operations: false,
});

const isDark = computed(() => colorMode.value === 'dark');

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}

function handleMenuToggle(menuKey: string | null) {
  if (!menuKey) return;
  if (!isSidebarOpen.value) {
    isSidebarOpen.value = true;
  }
  expandedMenus.value[menuKey] = !expandedMenus.value[menuKey];
}

function isRouteActive(path: string) {
  if (path === '#' || path === '/') return route.path === '/';
  return route.path.startsWith(path);
}

function openCommandPalette() {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
}

async function handleLogout() {
  await authStore.logout();
}

// Navigation Structure mapping to existing Odiseo routes
const navigationData = [
  { name: 'Dashboard', icon: 'i-heroicons-home', path: '/', badge: null, items: [] },
  {
    name: 'Planificación Académica',
    icon: 'i-heroicons-academic-cap',
    menuKey: 'academics',
    path: '#',
    badge: null,
    items: [
      { name: 'Catálogos', path: '/catalogs', badge: null },
      { name: 'Ciclos Académicos', path: '/academic-time', badge: null },
      { name: 'Gestión de Sílabos', path: '/syllabus', badge: null },
    ]
  },
  {
    name: 'Operaciones',
    icon: 'i-heroicons-briefcase',
    menuKey: 'operations',
    path: '#',
    badge: null,
    items: [
      { name: 'Gestión de Materiales', path: '/materials', badge: null },
    ]
  },
  {
    name: 'Configuración',
    icon: 'i-heroicons-cog-8-tooth',
    menuKey: 'config',
    path: '#',
    badge: null,
    items: [
      { name: 'Plantillas PDF', path: '/config', badge: null },
    ]
  }
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
