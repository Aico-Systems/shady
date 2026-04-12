<script lang="ts">
  'use runes';
  import './wc/web-components';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import LanguageSwitcher from './lib/components/LanguageSwitcher.svelte';
  import { t, locale } from './i18n';
  import { themeStore, type Theme } from './lib/stores/theme';
  import { onDestroy } from 'svelte';
  import { runtimeConfig } from './lib/config';

  const isDevMode = typeof window !== 'undefined' && window.location.pathname.startsWith('/dev');

  const query = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialOrg =
    query?.get('org') ||
    query?.get('orgId') ||
    runtimeConfig.DEFAULT_ORG_ID ||
    '';

  let orgId = $state(initialOrg);
  let previewTheme = $state<Theme>('auto');
  const hasOrgId = $derived(orgId.trim().length > 0);
  const embedOrgId = $derived(hasOrgId ? orgId : 'your-booking-slug');

  const unsubscribe = themeStore.subscribe((value) => {
    previewTheme = value;
  });

  onDestroy(unsubscribe);

  const codeSnippet = $derived(
    [
      `<script src="${runtimeConfig.WIDGET_SCRIPT_URL}"><\\/script>`,
      '',
      `<ac-booking`,
      `  org-id="${embedOrgId}"`,
      `  api-url="${runtimeConfig.API_URL}"`,
      `  locale="${$locale}"`,
      `  theme="${previewTheme}"`,
      `></ac-booking>`,
    ].join('\n')
  );
</script>

{#if isDevMode}
  <main class="widget-shell">
    <section class="hero">
      <div class="controls">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
      <p class="eyebrow">Booking Experience</p>
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
          {#if hasOrgId}
            <ac-booking
              org-id={orgId}
              api-url={runtimeConfig.API_URL}
              locale={$locale}
              theme={previewTheme}
            ></ac-booking>
          {:else}
            <div class="preview-empty">
              <h3>{$t('app.demo.previewEmptyTitle')}</h3>
              <p>{$t('app.demo.previewEmptyDescription')}</p>
            </div>
          {/if}
        </div>
      </div>

      <div class="panel">
        <h2>{$t('app.demo.embedTitle')}</h2>
        <p>{$t('app.demo.embedDescription')}</p>

        <div class="form-group">
          <label for="org-input">Org ID / Slug</label>
          <input id="org-input" type="text" bind:value={orgId} placeholder="aico-global" />
        </div>

        <div class="code-card">
          <pre><code>{codeSnippet}</code></pre>
        </div>
      </div>
    </section>
  </main>
{:else}
  <main class="booking-page">
    <ac-booking
      org-id="aico-global"
      api-url={runtimeConfig.API_URL}
      locale={$locale}
      theme={previewTheme}
    ></ac-booking>
  </main>
{/if}
