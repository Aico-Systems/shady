import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig({
  plugins: [svelte()],
  envDir: '/workspace',  // Load .env from workspace root (mounted from host)
  envPrefix: 'VITE_',
  server: {
    port: 5175,
    host: '0.0.0.0',
    watch: {
      usePolling: true
    }
  }
})
