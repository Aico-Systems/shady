import {
  init,
  addMessages,
  locale,
  _ as t,
} from 'svelte-i18n';

import en from './locales/en.json';
import de from './locales/de.json';

// Keep in sync with the locale catalogs imported above. Base language only —
// regional variants (de-DE, en-GB, …) resolve via svelte-i18n's fallback chain.
export const SUPPORTED_LOCALES = ['en', 'de'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Pick the visitor's preferred locale.
 *
 * svelte-i18n's built-in getLocaleFromNavigator() only returns
 * navigator.language (singular = top of the list). On browsers configured
 * `en-US, de-DE` (Chrome's default on many non-English OSes) that means
 * German speakers always get English even though German is their actual
 * preference. Walk navigator.languages (plural) and pick the first entry
 * whose base language matches a catalog we ship.
 */
export function detectPreferredLocale(): string {
  if (typeof navigator === 'undefined') return 'en';
  const candidates: string[] = Array.isArray(navigator.languages) && navigator.languages.length > 0
    ? [...navigator.languages]
    : navigator.language
    ? [navigator.language]
    : [];

  for (const candidate of candidates) {
    if (!candidate) continue;
    const base = candidate.toLowerCase().split('-')[0];
    if ((SUPPORTED_LOCALES as readonly string[]).includes(base)) {
      return candidate;
    }
  }

  return 'en';
}

let initialized = false;

export function ensureI18n(initialLocale?: string) {
  if (!initialized) {
    addMessages('en', en);
    addMessages('de', de);
    init({
      fallbackLocale: 'en',
      initialLocale: initialLocale || detectPreferredLocale(),
    });
    initialized = true;
  }

  if (initialLocale) {
    locale.set(initialLocale);
  }
}

export { locale, t };
