<template>
  <div>
    <h1 class="text-2xl font-semibold text-gray-900">Redirigiendo...</h1>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: [
    function (to, from) {
      return navigateTo('/admin/dashboard')
    },
  ],
})
</script>
