<template>
  <div class="flex h-screen w-full font-sans overflow-hidden bg-slate-50 dark:bg-[#1e1e2d] transition-colors duration-300">
    
    <!-- Sidebar -->
    <aside
      class="
        bg-slate-900
        border-slate-800 border-r
        transition-all duration-300 ease-in-out
        flex flex-col h-screen fixed lg:sticky top-0 z-40 w-64
      "
    >
      <!-- Brand Header -->
      <div class="h-20 flex items-center px-6 border-slate-800 border-b shrink-0">
        <div class="flex items-center gap-3">
          <div class="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-lg shrink-0">
            <span class="font-black text-xl">O</span>
          </div>
          <div class="flex flex-col overflow-hidden whitespace-nowrap">
            <span class="text-xl font-bold tracking-tight text-white truncate">
              Odiseo <span class="text-indigo-400">Admin</span>
            </span>
            <span class="text-[10px] uppercase tracking-wider text-slate-400 truncate">SaaS Management</span>
          </div>
        </div>
      </div>

      <!-- Navigation Links -->
      <div class="flex-1 overflow-y-auto py-6">
        <nav class="px-3 space-y-2">
          <NuxtLink 
            to="/admin/dashboard" 
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            active-class="bg-indigo-500/10 text-indigo-400 font-semibold"
          >
            <UIcon name="i-heroicons-home" class="w-5 h-5 shrink-0" />
            <span class="text-sm">Dashboard</span>
          </NuxtLink>
          <NuxtLink 
            to="/admin/tenants" 
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            active-class="bg-indigo-500/10 text-indigo-400 font-semibold"
          >
            <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 shrink-0" />
            <span class="text-sm">Empresas (Tenants)</span>
          </NuxtLink>
          <NuxtLink 
            to="/admin/subscriptions" 
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
            active-class="bg-indigo-500/10 text-indigo-400 font-semibold"
          >
            <UIcon name="i-heroicons-credit-card" class="w-5 h-5 shrink-0" />
            <span class="text-sm">Suscripciones</span>
          </NuxtLink>
        </nav>
      </div>

      <!-- User Profile Footer -->
      <div class="p-4 border-t border-slate-800 shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-3 overflow-hidden">
          <div class="relative shrink-0">
            <div class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white">
              <span class="text-xs font-bold">SA</span>
            </div>
            <div class="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></div>
          </div>
          <div class="flex flex-col truncate">
            <span class="text-sm font-semibold text-white truncate">Super Admin</span>
            <span class="text-xs text-slate-400 truncate">System</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <main class="flex-1 flex flex-col h-screen overflow-hidden">
      <!-- Top Header -->
      <header class="h-20 bg-white dark:bg-[#2b2b3f] border-b border-slate-200 dark:border-slate-700/50 flex items-center justify-between px-6 shrink-0 z-30 transition-colors duration-300">
        <div></div>
        <div class="flex items-center gap-3">
          <button 
            @click="toggleTheme"
            class="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#36364e] transition-colors"
          >
            <UIcon :name="isDark ? 'i-heroicons-moon' : 'i-heroicons-sun'" class="w-5 h-5" />
          </button>
        </div>
      </header>

      <!-- Content View -->
      <div class="flex-1 overflow-auto p-6 md:p-8 max-w-[1600px] mx-auto w-full">
        <slot />
      </div>
    </main>

  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useColorMode } from '#imports';

const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark';
}
</script>
