import {
  init,
  addMessages,
  getLocaleFromNavigator,
  locale,
  _ as t,
} from 'svelte-i18n';

import en from './locales/en.json';
import de from './locales/de.json';

let initialized = false;

export function ensureI18n(initialLocale?: string) {
  if (!initialized) {
    addMessages('en', en);
    addMessages('de', de);
    init({
      fallbackLocale: 'en',
      initialLocale: initialLocale || getLocaleFromNavigator() || 'en',
    });
    initialized = true;
  }

  if (initialLocale) {
    locale.set(initialLocale);
  }
}

export { locale, t };
