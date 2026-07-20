// Trigger restart to load new tailwind.config.ts
export default defineNuxtConfig({
  compatibilityDate: '2026-06-15',
  srcDir: 'src/',
  modules: ['@pinia/nuxt', '@nuxt/ui', '@nuxt/eslint'],
  devtools: { enabled: true },
  devServer: {
    port: 3001
  },
  routeRules: {
    '/api/**': { proxy: 'http://localhost:3000/api/**' }
  },
  css: ['~/assets/css/main.css'],
  vite: {
    optimizeDeps: {
      include: [
        '@vue/devtools-core',
        '@vue/devtools-kit',
        'pinia'
      ]
    }
  }
})
