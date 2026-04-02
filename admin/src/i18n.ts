import {
  _,
  initBlueprintI18n,
  locale,
  locales,
  setBlueprintLocale,
} from '@aico/blueprint';

type MessageTree = Record<string, unknown>;

function extractLocaleCodeFromPath(path: string): string | null {
  const match = path.match(/\/([^/]+)\.json$/);
  return match?.[1] ?? null;
}

function loadAppMessages(): Record<string, MessageTree> {
  const modules = import.meta.glob('./locales/*.json', {
    eager: true,
    import: 'default',
  }) as Record<string, unknown>;

  const messages: Record<string, MessageTree> = {};
  for (const path of Object.keys(modules)) {
    const localeCode = extractLocaleCodeFromPath(path);
    if (!localeCode) continue;
    const dictionary = modules[path];
    if (dictionary && typeof dictionary === 'object' && !Array.isArray(dictionary)) {
      messages[localeCode] = dictionary as MessageTree;
    }
  }

  return messages;
}

let initialized = false;

export function initI18n() {
  if (initialized) return;

  initBlueprintI18n({
    fallbackLocale: 'en',
    storageKey: 'aico-admin-locale',
    appMessages: loadAppMessages(),
  });

  initialized = true;
}

export function setLocale(localeCode: string) {
  setBlueprintLocale(localeCode);
}

export { locale, locales, _ as t };
