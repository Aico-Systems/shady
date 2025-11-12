<script lang="ts">
  'use runes';
  import './wc/web-components';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import LanguageSwitcher from './lib/components/LanguageSwitcher.svelte';
  import { t, locale } from './i18n';
  import { themeStore, type Theme } from './lib/stores/theme';
  import { onDestroy } from 'svelte';

  let orgId = $state('org-b4rp0bko');
  let apiUrl = $state('http://localhost:5006');
  let previewTheme = $state<Theme>('auto');

  const unsubscribe = themeStore.subscribe((value) => {
    previewTheme = value;
  });

  onDestroy(unsubscribe);

  const codeSnippet = $derived(
    [
      '<script src="https://cdn.example.com/aico-booking.js"><\\/script>',
      '',
      `<ac-booking`,
      `  org-id="${orgId}"`,
      `  api-url="${apiUrl}"`,
      `  locale="${$locale}"`,
      `  theme="${previewTheme}"`,
      `></ac-booking>`,
    ].join('\n')
  );
</script>

<main class="widget-shell">
  <section class="hero">
    <div class="controls">
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
    <h1>{$t('app.title')}</h1>
    <p>{$t('app.subtitle')}</p>
    <div class="chip-list">
      {#each $t('app.demo.chips') as chip}
        <span class="chip">{chip}</span>
      {/each}
    </div>
  </section>

  <section class="demo-grid">
    <div class="panel">
      <h2>{$t('app.demo.livePreview')}</h2>
      <div class="preview-card">
        <ac-booking
          org-id={orgId}
          api-url={apiUrl}
          locale={$locale}
          theme={previewTheme}
        ></ac-booking>
      </div>
    </div>

    <div class="panel">
      <h2>{$t('app.demo.embedTitle')}</h2>
      <p>{$t('app.demo.embedDescription')}</p>

      <div class="form-group">
        <label for="org-input">Org ID / Slug</label>
        <input id="org-input" type="text" bind:value={orgId} />
      </div>

      <div class="form-group">
        <label for="api-url">API URL</label>
        <input id="api-url" type="text" bind:value={apiUrl} />
      </div>

      <div class="code-card">
        <pre><code>{codeSnippet}</code></pre>
      </div>
    </div>
  </section>
</main>
