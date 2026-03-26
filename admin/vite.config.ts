import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

function loadEnvFileIntoProcess(filePath: string) {
  if (!existsSync(filePath)) return

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!(key in process.env)) {
      process.env[key] = value
    }
  }
}

function hydrateAdminEnv(mode: string) {
  const localEnvFiles = [
    resolve(__dirname, '.env.development'),
    resolve(__dirname, '.env'),
    resolve(__dirname, '../.env')
  ]
  const rootEnvFiles =
    mode === 'development' || mode === 'dev'
      ? [resolve(__dirname, '../../.env.dev.generated'), resolve(__dirname, '../../.env.dev')]
      : []

  for (const envFile of [...localEnvFiles, ...rootEnvFiles]) {
    loadEnvFileIntoProcess(envFile)
  }

  if (!process.env.VITE_BACKEND_URL && process.env.BACKEND_URL) {
    process.env.VITE_BACKEND_URL = process.env.BACKEND_URL
  }
  if (!process.env.VITE_LOGTO_ENDPOINT && process.env.LOGTO_ENDPOINT) {
    process.env.VITE_LOGTO_ENDPOINT = process.env.LOGTO_ENDPOINT
  }
  if (!process.env.VITE_WIDGET_URL && process.env.WIDGET_URL) {
    process.env.VITE_WIDGET_URL = process.env.WIDGET_URL
  }
}

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
export default defineConfig(({ mode }) => {
  hydrateAdminEnv(mode)

  return ({
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
})})
