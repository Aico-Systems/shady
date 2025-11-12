import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark' | 'auto';

function createThemeStore() {
  const { subscribe, set } = writable<Theme>('auto');

  return {
    subscribe,
    init: () => {
      if (typeof window === 'undefined') return;
      const stored = (localStorage.getItem('aico-admin-theme') as Theme) || 'auto';
      set(stored);
      applyTheme(stored);
    },
    setTheme: (theme: Theme) => {
      set(theme);
      applyTheme(theme);
      if (typeof window !== 'undefined') {
        localStorage.setItem('aico-admin-theme', theme);
      }
    },
  };
}

function applyTheme(theme: Theme) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('aico-dark');

  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = prefersDark ? 'dark' : 'light';
    if (prefersDark) {
      root.classList.add('aico-dark');
    }
  } else {
    root.dataset.theme = theme;
    if (theme === 'dark') {
      root.classList.add('aico-dark');
    }
  }
}

export const themeStore = createThemeStore();
