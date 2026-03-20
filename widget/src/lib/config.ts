declare global {
  interface Window {
    __ENV__?: Record<string, string | undefined>;
  }
}

type RuntimeKey =
  | 'VITE_BACKEND_URL'
  | 'VITE_WIDGET_URL'
  | 'VITE_WIDGET_DEFAULT_ORG';

const initialScriptSrc = (() => {
  if (typeof document === 'undefined') return undefined;

  const current = document.currentScript;
  if (current instanceof HTMLScriptElement && current.src) {
    return current.src;
  }

  const widgetScript = Array.from(document.getElementsByTagName('script')).find((script) =>
    script.src?.includes('/widget.js')
  );

  return widgetScript?.src;
})();

function readRuntimeValue(key: RuntimeKey): string | undefined {
  if (typeof window !== 'undefined' && window.__ENV__?.[key]) {
    return window.__ENV__[key];
  }

  const value = import.meta.env[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeUrl(value?: string): string | undefined {
  if (!value) return undefined;
  return value.replace(/\/$/, '');
}

function deriveApiUrlFromWidgetUrl(widgetUrl: string): string {
  const parsed = new URL(widgetUrl);
  const { protocol, hostname, port } = parsed;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    if (port === '5174') return `${protocol}//${hostname}:5006`;
    if (port === '3001') return `${protocol}//${hostname}:8000`;
  }

  if (hostname.startsWith('widget.')) {
    return `${protocol}//api.${hostname.slice('widget.'.length)}${port ? `:${port}` : ''}`;
  }

  return parsed.origin;
}

function resolveWidgetUrl(): string {
  const explicit = normalizeUrl(readRuntimeValue('VITE_WIDGET_URL'));
  if (explicit) return explicit;

  if (initialScriptSrc) {
    return normalizeUrl(new URL(initialScriptSrc).origin) as string;
  }

  if (typeof window !== 'undefined') {
    return normalizeUrl(window.location.origin) as string;
  }

  return 'http://localhost:5178';
}

function resolveApiUrl(widgetUrl: string): string {
  return (
    normalizeUrl(readRuntimeValue('VITE_BACKEND_URL')) ??
    deriveApiUrlFromWidgetUrl(widgetUrl)
  );
}

export const runtimeConfig = (() => {
  const WIDGET_URL = resolveWidgetUrl();
  const API_URL = resolveApiUrl(WIDGET_URL);
  const WIDGET_SCRIPT_URL = `${WIDGET_URL}/widget.js`;
  const DEFAULT_ORG_ID = readRuntimeValue('VITE_WIDGET_DEFAULT_ORG') || '';

  return {
    API_URL,
    WIDGET_URL,
    WIDGET_SCRIPT_URL,
    DEFAULT_ORG_ID
  };
})();
