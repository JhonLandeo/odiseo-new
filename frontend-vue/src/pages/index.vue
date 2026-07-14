<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useAuthStore } from '@/stores/auth.store';
import { useMaterialsStore } from '@/features/materials/store/materials';
import { useOnboardingStore } from '@/features/onboarding/store/onboarding';
import OnboardingChecklistWidget from '@/features/onboarding/components/OnboardingChecklistWidget.vue';
import OnboardingEmptyState from '@/features/onboarding/components/OnboardingEmptyState.vue';
import { useRouter } from 'vue-router';

definePageMeta({
  layout: 'b2b',
});

const authStore = useAuthStore();
const materialsStore = useMaterialsStore();
const onboardingStore = useOnboardingStore();
const router = useRouter();

const isSuperAdmin = ref(false);
const isLoadingData = ref(true);

interface DashboardMetrics {
  totalMaterials: number;
  totalQuestions: number;
  totalReplacements: number;
  statusCounts: Record<string, number>;
  cyclesBreakdown: any[];
  recentHistory: any[];
}

const metrics = ref<DashboardMetrics>({
  totalMaterials: 0,
  totalQuestions: 0,
  totalReplacements: 0,
  statusCounts: {},
  cyclesBreakdown: [],
  recentHistory: [],
});

const tenantName = computed(() => authStore.branding?.commercialName || 'tu institución');
const userName = computed(() => authStore.user?.name || 'Usuario');

const isBrandNew = computed(() => {
  if (!onboardingStore.hasFetched) return false;
  const cycleStep = onboardingStore.availableSteps.find(s => s.id === 'load_demo_or_create_cycle');
  return cycleStep ? !cycleStep.completed : false;
});

const curationRate = computed(() => {
  if (!metrics.value.totalQuestions) return 0;
  return Math.round((metrics.value.totalReplacements / metrics.value.totalQuestions) * 100);
});

onMounted(async () => {
  const subdomain = authStore.getSubdomain();
  if (subdomain === 'odiseo') {
    isSuperAdmin.value = true;
    router.replace('/admin/dashboard');
    return;
  }

  try {
    const data = await materialsStore.fetchDashboardMetrics();
    if (data) {
      metrics.value = data;
    }
    // Fetch onboarding progress in parallel (non-blocking)
    onboardingStore.fetchProgress().catch(() => {});
  } catch (error) {
    console.error('Error loading dashboard metrics:', error);
  } finally {
    isLoadingData.value = false;
  }
});

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50';
    case 'COMPLETED_WITH_WARNINGS':
      return 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-400 border-teal-200 dark:border-teal-800/50';
    case 'REVIEW_REQUIRED':
    case 'IN_REVIEW':
      return 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50';
    case 'PROCESSING':
    case 'PENDING':
      return 'bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-400 border-sky-200 dark:border-sky-800/50';
    case 'FAILED':
      return 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400 border-rose-200 dark:border-rose-800/50';
    default:
      return 'bg-slate-50 text-slate-700 dark:bg-slate-900 dark:text-slate-400 border-slate-200 dark:border-slate-800';
  }
}

function translateStatus(status: string) {
  switch (status) {
    case 'COMPLETED': return 'Completado';
    case 'COMPLETED_WITH_WARNINGS': return 'Completado c/ Alertas';
    case 'REVIEW_REQUIRED': return 'Por Revisar';
    case 'IN_REVIEW': return 'En Revisión';
    case 'PROCESSING': return 'Procesando';
    case 'PENDING': return 'Pendiente';
    case 'FAILED': return 'Fallado';
    default: return status;
  }
}

function formatDate(dateString: string) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <div v-if="!isSuperAdmin" class="space-y-8 animate-fade-in pb-12">
    <!-- Welcome Header Card -->
    <div
      class="relative overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-800 p-8 text-white shadow-xl shadow-indigo-950/10">
      <div class="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-2xl"></div>
      <div class="absolute right-20 -bottom-10 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>

      <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div class="space-y-2">
          <div
            class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs font-semibold tracking-wider uppercase">
            <UIcon name="i-heroicons-sparkles" class="w-3.5 h-3.5" />
            Operaciones Activas
          </div>
          <h1 class="text-3xl md:text-4xl font-extrabold tracking-tight">
            ¡Hola, bienvenido!
          </h1>
          <p class="text-indigo-100 max-w-xl text-sm md:text-base">
            Bienvenido a la plataforma de <span class="font-bold text-white">{{ tenantName }}</span>. Aquí puedes
            monitorear el consumo del plan y gestionar el material de estudio.
          </p>
        </div>

        <div class="flex items-center gap-3 shrink-0">
          <button @click="router.push('/materials')"
            class="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 px-5 py-3 rounded-2xl font-semibold text-sm transition-all duration-300 shadow-md hover:shadow-lg active:scale-95">
            <UIcon name="i-heroicons-document-plus" class="w-5 h-5" />
            Generar Material
          </button>
        </div>
      </div>
    </div>

    <!-- Empty State for Brand New Tenants -->
    <div v-if="isBrandNew" class="bg-white dark:bg-[#2b2b3f] rounded-3xl border border-slate-100 dark:border-slate-700/50 p-6 md:p-12 shadow-sm">
      <OnboardingEmptyState
        title="Tu plataforma está lista"
        description="Para comenzar a generar material de estudio, necesitas un Ciclo Académico. Carga los datos de demostración o crea tu primer ciclo manualmente."
        icon="i-heroicons-rocket-launch"
        createLabel="Ciclo Académico"
        @create="router.push('/academic-time')"
        @demo_loaded="async () => { await Promise.all([materialsStore.fetchDashboardMetrics().then(data => data && (metrics = data)), onboardingStore.fetchProgress()]) }"
      />
    </div>

    <template v-else>
      <!-- Metrics Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

      <!-- Card 1: Generated Materials -->
      <div
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all group duration-300">
        <div v-if="isLoadingData" class="animate-pulse space-y-4">
          <div class="flex justify-between items-start">
            <div class="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
            <div class="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center justify-between">
            <div
              class="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-document-text" class="w-6 h-6" />
            </div>
            <span
              class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Historial</span>
          </div>
          <div>
            <h3 class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ metrics.totalMaterials }}</h3>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Materiales Generados</p>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-emerald-500" />
            Archivos listos para descarga
          </div>
        </div>
      </div>

      <!-- Card 2: Questions Consumed -->
      <div
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all group duration-300">
        <div v-if="isLoadingData" class="animate-pulse space-y-4">
          <div class="flex justify-between items-start">
            <div class="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
            <div class="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center justify-between">
            <div
              class="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-light-bulb" class="w-6 h-6" />
            </div>
            <span
              class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Consumo</span>
          </div>
          <div>
            <h3 class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ metrics.totalQuestions }}</h3>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Preguntas Utilizadas</p>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <UIcon name="i-heroicons-chart-bar" class="w-4 h-4 text-emerald-500" />
            Extraídas del banco central
          </div>
        </div>
      </div>

      <!-- Card 3: Replacements / Edits -->
      <div
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all group duration-300">
        <div v-if="isLoadingData" class="animate-pulse space-y-4">
          <div class="flex justify-between items-start">
            <div class="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
            <div class="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center justify-between">
            <div
              class="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-arrow-path" class="w-6 h-6" />
            </div>
            <span
              class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ajustes</span>
          </div>
          <div>
            <h3 class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ metrics.totalReplacements }}</h3>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Reemplazos Manuales</p>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <UIcon name="i-heroicons-adjustments-horizontal" class="w-4 h-4 text-amber-500" />
            Curaduría pedagógica activa
          </div>
        </div>
      </div>

      <!-- Card 4: Curation Efficiency Rate -->
      <div
        class="bg-white dark:bg-[#2b2b3f] rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 shadow-sm hover:shadow-md transition-all group duration-300">
        <div v-if="isLoadingData" class="animate-pulse space-y-4">
          <div class="flex justify-between items-start">
            <div class="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-xl"></div>
            <div class="w-20 h-4 bg-slate-200 dark:bg-slate-700 rounded"></div>
          </div>
          <div class="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
          <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3"></div>
        </div>

        <div v-else class="space-y-4">
          <div class="flex items-center justify-between">
            <div
              class="w-12 h-12 rounded-2xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-sparkles" class="w-6 h-6" />
            </div>
            <span
              class="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Eficiencia</span>
          </div>
          <div>
            <h3 class="text-3xl font-bold text-slate-800 dark:text-slate-100">{{ curationRate }}%</h3>
            <p class="text-sm font-medium text-slate-500 dark:text-slate-400 mt-1">Tasa de Curaduría</p>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <UIcon name="i-heroicons-bolt" class="w-4 h-4 text-purple-500" />
            Personalización de balotarios
          </div>
        </div>
      </div>

    </div>

    <!-- Main Section Split Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">

      <!-- Recent Activity (Left 2 Columns) -->
      <div
        class="lg:col-span-2 bg-white dark:bg-[#2b2b3f] rounded-3xl border border-slate-100 dark:border-slate-700/50 p-6 md:p-8 shadow-sm space-y-6">
        <div class="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-4">
          <div>
            <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">Actividad de Generación Reciente</h2>
            <p class="text-sm text-slate-400 dark:text-slate-500 mt-0.5">Los últimos 5 materiales solicitados en tu
              colegio.</p>
          </div>
          <button @click="router.push('/materials')"
            class="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 flex items-center gap-1">
            Ver todos
            <UIcon name="i-heroicons-chevron-right" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Loading Skeleton for History Table -->
        <div v-if="isLoadingData" class="space-y-4">
          <div v-for="i in 3" :key="i"
            class="flex items-center justify-between py-3 border-b border-slate-50 dark:border-slate-800">
            <div class="flex items-center gap-4">
              <div class="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse"></div>
              <div class="space-y-2">
                <div class="w-32 h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
                <div class="w-20 h-3 bg-slate-100 dark:bg-slate-800 rounded animate-pulse"></div>
              </div>
            </div>
            <div class="w-16 h-6 bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse"></div>
          </div>
        </div>

        <!-- History Table Content -->
        <div v-else-if="metrics.recentHistory && metrics.recentHistory.length > 0" class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr
                class="text-xs font-semibold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-700/50 pb-3">
                <th class="pb-3 font-medium">Plantilla</th>
                <th class="pb-3 font-medium text-center">Semana</th>
                <th class="pb-3 font-medium">Estado</th>
                <th class="pb-3 font-medium">Fecha</th>
                <th class="pb-3 font-medium text-right">Acción</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-slate-700/30 text-sm">
              <tr v-for="item in metrics.recentHistory" :key="item.id"
                class="hover:bg-slate-50/50 dark:hover:bg-[#34344c]/30 transition-colors group">
                <td class="py-4 font-semibold text-slate-700 dark:text-slate-300">
                  <div class="flex flex-col">
                    <span>{{ item.templateName || 'Material Académico' }}</span>
                    <span class="text-[10px] font-semibold text-indigo-500 dark:text-indigo-400 mt-0.5">{{
                      item.cycleName || 'Ciclo General' }}</span>
                  </div>
                </td>
                <td class="py-4 text-center text-slate-500 dark:text-slate-400 font-medium">
                  Semana {{ item.weekNumber }}
                </td>
                <td class="py-4">
                  <span class="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border"
                    :class="getStatusBadgeClass(item.status)">
                    <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
                    {{ translateStatus(item.status) }}
                  </span>
                </td>
                <td class="py-4 text-slate-400 dark:text-slate-500 text-xs">
                  {{ formatDate(item.createdAt) }}
                </td>
                <td class="py-4 text-right">
                  <button @click="router.push('/materials')"
                    class="p-2 rounded-lg bg-slate-50 dark:bg-[#1e1e2d] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-[#36364e] transition-colors">
                    <UIcon name="i-heroicons-eye" class="w-4 h-4" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else
          class="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 space-y-3">
          <div class="w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
            <UIcon name="i-heroicons-document" class="w-8 h-8 text-slate-300 dark:text-slate-600" />
          </div>
          <div class="text-center">
            <p class="font-semibold text-slate-600 dark:text-slate-400">Sin generaciones aún</p>
            <p class="text-xs text-slate-400">Comienza solicitando tu primer material académico.</p>
          </div>
        </div>
      </div>

      <!-- Quick Actions / Academic Health (Right 1 Column) -->
      <div class="space-y-6">
        <!-- Cycles comparative breakdown card -->
        <div
          class="bg-white dark:bg-[#2b2b3f] rounded-3xl border border-slate-100 dark:border-slate-700/50 p-6 md:p-8 shadow-sm space-y-6">
          <div class="flex justify-between items-center">
            <h2 class="text-xl font-bold text-slate-800 dark:text-slate-100">Consumo por Ciclo</h2>
            <UIcon name="i-heroicons-chart-pie" class="w-5 h-5 text-slate-400" />
          </div>

          <div v-if="isLoadingData" class="space-y-4">
            <div v-for="i in 2" :key="i" class="h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse"></div>
          </div>

          <div v-else-if="metrics.cyclesBreakdown && metrics.cyclesBreakdown.length > 0" class="space-y-4">
            <div v-for="cycle in metrics.cyclesBreakdown" :key="cycle.id"
              class="p-4 rounded-2xl border border-slate-100 dark:border-slate-700/30 bg-slate-50/50 dark:bg-[#1e1e2d]/50 space-y-3">
              <div class="flex items-center justify-between">
                <span class="font-bold text-sm text-slate-700 dark:text-slate-200 truncate pr-2">{{ cycle.name }}</span>
                <span class="text-[10px] font-semibold px-2 py-0.5 rounded-full" :class="cycle.isActive
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400'
                  : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'">
                  {{ cycle.isActive ? 'Activo' : 'Cerrado' }}
                </span>
              </div>

              <div class="grid grid-cols-3 gap-2 pt-1 text-center">
                <div class="bg-white dark:bg-[#2b2b3f] p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span class="block text-[10px] font-semibold text-slate-400 uppercase">PDFs</span>
                  <span class="text-sm font-bold text-slate-750 dark:text-slate-300">{{ cycle.materialsCount }}</span>
                </div>
                <div class="bg-white dark:bg-[#2b2b3f] p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span class="block text-[10px] font-semibold text-slate-400 uppercase">Reactivos</span>
                  <span class="text-sm font-bold text-slate-750 dark:text-slate-300">{{ cycle.questionsCount }}</span>
                </div>
                <div class="bg-white dark:bg-[#2b2b3f] p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span class="block text-[10px] font-semibold text-slate-400 uppercase">Sílabos</span>
                  <span class="text-sm font-bold text-slate-750 dark:text-slate-300">{{ cycle.syllabusCount }}</span>
                </div>
              </div>
            </div>
          </div>

          <div v-else class="text-center py-6 text-slate-450 dark:text-slate-500 text-xs">
            No hay ciclos académicos registrados.
          </div>
        </div>

        <!-- Quick Access Shortcuts -->
        <div
          class="bg-white dark:bg-[#2b2b3f] rounded-3xl border border-slate-100 dark:border-slate-700/50 p-6 md:p-8 shadow-sm space-y-4">
          <h2 class="text-lg font-bold text-slate-800 dark:text-slate-100">Accesos Rápidos</h2>
          <div class="grid grid-cols-2 gap-3">
            <button @click="router.push('/materials')"
              class="flex flex-col items-center justify-center p-4 rounded-2xl bg-indigo-50/50 hover:bg-indigo-50 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 border border-indigo-100/50 dark:border-indigo-500/10 text-center space-y-2 group transition-all">
              <UIcon name="i-heroicons-document-plus"
                class="w-6 h-6 text-indigo-600 group-hover:scale-110 transition-transform" />
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Nuevo Material</span>
            </button>

            <button @click="router.push('/syllabus')"
              class="flex flex-col items-center justify-center p-4 rounded-2xl bg-emerald-50/50 hover:bg-emerald-50 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40 border border-emerald-100/50 dark:border-emerald-500/10 text-center space-y-2 group transition-all">
              <UIcon name="i-heroicons-list-bullet"
                class="w-6 h-6 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Planificar Sílabos</span>
            </button>

            <button @click="router.push('/academic-time')"
              class="flex flex-col items-center justify-center p-4 rounded-2xl bg-amber-50/50 hover:bg-amber-50 dark:bg-[#3d3326]/20 dark:hover:bg-[#3d3326]/40 border border-amber-100/50 dark:border-amber-500/10 text-center space-y-2 group transition-all">
              <UIcon name="i-heroicons-calendar"
                class="w-6 h-6 text-amber-600 group-hover:scale-110 transition-transform" />
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Ciclos Académicos</span>
            </button>

            <button @click="router.push('/config')"
              class="flex flex-col items-center justify-center p-4 rounded-2xl bg-purple-50/50 hover:bg-purple-50 dark:bg-[#3c2a44]/20 dark:hover:bg-[#3c2a44]/40 border border-purple-100/50 dark:border-purple-500/10 text-center space-y-2 group transition-all">
              <UIcon name="i-heroicons-paint-brush"
                class="w-6 h-6 text-purple-600 group-hover:scale-110 transition-transform" />
              <span class="text-xs font-semibold text-slate-700 dark:text-slate-300">Diseño PDF</span>
            </button>
          </div>
        </div>
      </div>

    </div>
    </template>

    <!-- Fixed onboarding checklist widget (bottom-right overlay) -->
    <OnboardingChecklistWidget />
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
