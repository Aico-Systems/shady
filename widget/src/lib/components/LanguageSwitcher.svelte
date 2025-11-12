<script lang="ts">
  'use runes';
  import { locale } from '../../i18n';
  import { get } from 'svelte/store';
  import { onDestroy } from 'svelte';

  const languages = [
    { code: 'en', label: 'EN' },
    { code: 'de', label: 'DE' },
  ];

  let currentLocale = $state(get(locale) || 'en');
  const unsub = locale.subscribe((value) => (currentLocale = value || 'en'));
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
