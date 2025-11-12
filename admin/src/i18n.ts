import {
  init,
  addMessages,
  getLocaleFromNavigator,
  locale,
  locales,
  _ as t,
} from 'svelte-i18n';

import en from './locales/en.json';
import de from './locales/de.json';

let initialized = false;

export function initI18n() {
  if (initialized) return;

  addMessages('en', en);
  addMessages('de', de);

  const savedLocale =
    typeof window !== 'undefined' ? localStorage.getItem('aico-admin-locale') : null;
  const browserLocale = getLocaleFromNavigator();
  const initialLocale = savedLocale || browserLocale || 'en';

  init({
    fallbackLocale: 'en',
    initialLocale,
  });

  initialized = true;
}

export function setLocale(localeCode: string) {
  locale.set(localeCode);
  if (typeof window !== 'undefined') {
    localStorage.setItem('aico-admin-locale', localeCode);
  }
}

export { locale, locales, t };
