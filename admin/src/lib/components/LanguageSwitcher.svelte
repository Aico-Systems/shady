<script lang="ts">
  import { locale } from '../../i18n';
  import { Globe } from '@lucide/svelte';
  import { get } from 'svelte/store';
  import { setLocale } from '../../i18n';
  import { onDestroy } from 'svelte';

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' },
  ];

  let currentLocale = $state(get(locale) || 'en');

  const unsub = locale.subscribe((value) => {
    currentLocale = value || 'en';
  });

  onDestroy(() => {
    unsub();
  });

  function changeLanguage(code: string) {
    setLocale(code);
  }
</script>

<div class="lang-toggle">
  <Globe size={16} aria-hidden="true" />
  <select bind:value={currentLocale} onchange={(e) => changeLanguage(e.currentTarget.value)}>
    {#each languages as lang}
      <option value={lang.code}>{lang.label}</option>
    {/each}
  </select>
</div>

<style>
  .lang-toggle {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 999px;
    border: 1px solid var(--aico-color-border-light);
    background: var(--aico-color-bg-primary);
    color: var(--aico-color-text-primary);
  }

  select {
    border: none;
    background: transparent;
    color: inherit;
    font-weight: 600;
    font-size: 0.85rem;
    appearance: none;
    padding-right: 4px;
  }

  select:focus-visible {
    outline: none;
  }
</style>
