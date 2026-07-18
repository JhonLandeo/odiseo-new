<template>
  <div class="px-8 py-6 max-w-full">
    <!-- Breadcrumb / back link -->
    <div class="mb-6">
      <NuxtLink
        to="/materials"
        class="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <UIcon name="i-heroicons-arrow-left" class="w-4 h-4" />
        <span>Volver al Monitor</span>
      </NuxtLink>
    </div>

    <!-- Loading skeleton -->
    <div v-if="isPageLoading" class="max-w-4xl mx-auto space-y-6">
      <div class="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 rounded-2xl">
        <div class="flex items-center gap-4">
          <div class="w-11 h-11 rounded-xl bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div class="space-y-2 flex-1">
            <div class="h-5 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div class="h-3 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
        </div>
      </div>
      <div class="space-y-3">
        <div v-for="i in 3" :key="i" class="h-32 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    </div>

    <!-- Review component wrapper -->
    <div v-else class="max-w-4xl mx-auto">
      <MaterialReviewList
        :materialId="materialId"
        @approved="handleApproved"
        @cancel="handleCancel"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMaterialsStore } from '@/features/materials/store/materials';
import MaterialReviewList from '@/features/materials/components/MaterialReviewList.vue';
import { PERMISSIONS } from '@/core/auth/permissions';

definePageMeta({
  layout: 'b2b',
  permissions: [PERMISSIONS.EDIT_MATERIALS]
});

const route = useRoute();
const router = useRouter();
const materialsStore = useMaterialsStore();
const materialId = route.params.id as string;

const isPageLoading = ref(true);

onMounted(async () => {
  try {
    await materialsStore.fetchReviewData(materialId);
  } finally {
    isPageLoading.value = false;
  }
});

function handleApproved(result: any) {
  router.push('/materials');
}

function handleCancel() {
  router.push('/materials');
}
</script>
