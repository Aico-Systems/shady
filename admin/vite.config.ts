import { existsSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

function resolveExistingPath(candidates: string[], sentinel: string) {
  return candidates.find((candidate) => existsSync(resolve(candidate, sentinel))) ?? candidates[0]
}

const blueprintPath = resolveExistingPath(
  [
    resolve(__dirname, 'blueprint/src'),
    resolve(__dirname, '../../blueprint/src')
  ],
  'blueprint.css'
)

const modelCatalogPath = resolveExistingPath(
  [
    resolve(__dirname, 'backend/model-catalog/src'),
    resolve(__dirname, '../../backend/model-catalog/src')
  ],
  'index.ts'
)

const entitySchemaPath = resolveExistingPath(
  [
    resolve(__dirname, 'backend/entity-schema/src'),
    resolve(__dirname, '../../backend/entity-schema/src')
  ],
  'index.ts'
)

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
      '@aico/blueprint': blueprintPath,
      '@aico/model-catalog': modelCatalogPath,
      '@aico/entity-schema': entitySchemaPath
    }
  },
  ssr: {
    noExternal: ['@aico/blueprint', '@aico/model-catalog', '@aico/entity-schema']
  },
  optimizeDeps: {
    exclude: ['@aico/blueprint', '@aico/model-catalog', '@aico/entity-schema']
  },
  server: {
    port: 5175,
    host: '0.0.0.0',
    watch: {
      usePolling: true
    }
  }
}))
