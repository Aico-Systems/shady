import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Compute __dirname for ES Modules:
const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => {
  if (command === 'build') {
    return {
      envPrefix: 'VITE_',
      plugins: [
        // Process normal Svelte files (exclude .wc.svelte files)
        svelte({
          exclude: '**/*.wc.svelte'
        }),
        // Process web component files (only include .wc.svelte files) and compile them as custom elements
        svelte({
          include: '**/*.wc.svelte',
          compilerOptions: {
            customElement: true
          }
        })
      ],
      build: {
        lib: {
          // Use the web component registration file as the library entry point
          entry: resolve(__dirname, 'src/wc/web-components.ts'),
          name: 'MyWebComponents',
          fileName: (format) => `my-web-components.${format}.js`,
          // Build both ES and UMD formats
          formats: ['es', 'umd']
        },
        rollupOptions: {
          // Externalize Svelte runtime to remove it from the bundle
          external: ['svelte', 'svelte/internal'],
          output: {
            globals: {
              svelte: 'Svelte',
              'svelte/internal': 'SvelteInternal'
            }
          }
        },
        // Disable sourcemaps for production
        sourcemap: false,
        outDir: 'dist'
      }
    }
  }

  // Development (dev server) configuration:
  return {
    envPrefix: 'VITE_',
    plugins: [
      svelte({
        exclude: '**/*.wc.svelte'
      }),
      svelte({
        include: '**/*.wc.svelte',
        compilerOptions: {
          customElement: true
        }
      })
    ],
    server: {
      port: 5174,
      host: '0.0.0.0',
      watch: {
        usePolling: true
      }
    }
  }
})
