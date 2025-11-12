import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  envDir: '/workspace',  // Load .env from workspace root (mounted from host)
  envPrefix: 'VITE_',
  resolve: {
    alias: {
      '@aico/blueprint': '/app/blueprint/src'
    }
  },
  ssr: {
    noExternal: ['@aico/blueprint']
  },
  optimizeDeps: {
    exclude: ['@aico/blueprint']
  },
  server: {
    port: 5175,
    host: '0.0.0.0',
    watch: {
      usePolling: true
    }
  }
})
