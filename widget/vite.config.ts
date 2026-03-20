import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// Compute __dirname for ES Modules:
const __dirname = dirname(fileURLToPath(import.meta.url))

function widgetDevEntrypoint() {
  return {
    name: 'widget-dev-entrypoint',
    configureServer(server: any) {
      server.middlewares.use('/widget.js', (_req: any, res: any) => {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        res.end(`(() => {
  const current = document.currentScript;
  const existing = document.querySelector('script[data-aico-booking-widget-dev-module="true"]');
  if (window.customElements?.get('ac-booking')) return;

  const fallback = Array.from(document.getElementsByTagName('script')).find((script) =>
    script.src && script.src.includes('/widget.js')
  );
  const scriptRef = current instanceof HTMLScriptElement ? current : fallback;
  const baseUrl = scriptRef?.src ? new URL(scriptRef.src).origin : window.location.origin;
  const moduleUrl = new URL('/src/wc/web-components.ts', baseUrl).href;

  if (!window.__AICO_BOOKING_WIDGET_READY__) {
    if (existing) {
      window.__AICO_BOOKING_WIDGET_READY__ = window.customElements.whenDefined('ac-booking');
      return;
    }

    const moduleScript = document.createElement('script');
    moduleScript.type = 'module';
    moduleScript.src = moduleUrl;
    moduleScript.dataset.aicoBookingWidgetDevModule = 'true';
    moduleScript.onerror = () => {
      window.__AICO_BOOKING_WIDGET_READY__ = Promise.reject(new Error('Failed to load booking widget module.'));
    };
    document.head.appendChild(moduleScript);

    window.__AICO_BOOKING_WIDGET_READY__ = window.customElements.whenDefined('ac-booking');
  }
})();`)
      })
    }
  }
}

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
          entry: resolve(__dirname, 'src/wc/web-components.ts'),
          name: 'AcBookingWidget',
          fileName: () => 'widget.js',
          formats: ['iife']
        },
        sourcemap: false,
        outDir: 'dist',
        emptyOutDir: true
      }
    }
  }

  // Development (dev server) configuration:
  return {
    envPrefix: 'VITE_',
    plugins: [
      widgetDevEntrypoint(),
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
