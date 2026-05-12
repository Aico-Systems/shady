<script lang="ts">
  'use runes';
  import { locale } from '../../i18n';
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' },
  ];

  // Normalize de-DE → de so the dropdown reflects what's actually rendered
  // (the catalog is selected by base language via svelte-i18n's fallback chain).
  function toBaseLocale(value: string | null | undefined): string {
    if (!value) return 'en';
    const base = value.toLowerCase().split('-')[0];
    return languages.some((l) => l.code === base) ? base : 'en';
  }

  let currentLocale = $state(toBaseLocale(get(locale)));
  const unsub = locale.subscribe((value) => (currentLocale = toBaseLocale(value)));
  onDestroy(unsub);
</script>

<label class="language">
  <span>Lang</span>
  <select bind:value={currentLocale} onchange={(e) => locale.set(e.currentTarget.value)}>
    {#each languages as lang}
      <option value={lang.code}>{lang.label}</option>
    {/each}
  </select>
</label>

<style>
  .language {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem 0.9rem;
    border-radius: 999px;
    border: 1px solid var(--aico-color-border-light);
    background: color-mix(in srgb, var(--aico-color-bg-primary) 92%, transparent);
    font-weight: 600;
    color: var(--aico-color-text-primary);
  }

  select {
    border: none;
    background: transparent;
    font: inherit;
    color: inherit;
    appearance: none;
    padding-right: 0.35rem;
  }

  select:focus-visible {
    outline: none;
  }
</style>
