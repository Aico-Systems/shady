import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
   plugins: [
    svelte({
      // Don't use hot option in Svelte 5
      hot: false,
      inspector: mode === 'development' ? {
        toggleKeyCombo: 'control-shift',
        showToggleButton: 'active',
        toggleButtonPos: 'bottom-right',
        holdMode: true
      } : false
    })
  ],
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
}))
