import { mount } from 'svelte';
import App from './App.svelte';
import './app.css';
import { initI18n } from './i18n';
import { themeStore } from './lib/stores/theme';

initI18n();
themeStore.init();

const app = mount(App, {
  target: document.getElementById('app')!,
});

export default app;
