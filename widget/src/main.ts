import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { ensureI18n } from './i18n';
import { themeStore } from './lib/stores/theme';

ensureI18n();
themeStore.init();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
