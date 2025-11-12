<script lang="ts">
  'use runes';
  import { themeStore, type Theme } from '../../lib/stores/theme';
  import { SunMedium, Moon, MonitorSmartphone } from '@lucide/svelte';
  import { onDestroy } from 'svelte';

  let currentTheme = $state<Theme>('auto');

  const unsubscribe = themeStore.subscribe((value) => {
    currentTheme = value;
  });

  onDestroy(unsubscribe);

  const options: { label: string; value: Theme; icon: typeof SunMedium }[] = [
    { label: 'Light', value: 'light', icon: SunMedium },
    { label: 'Dark', value: 'dark', icon: Moon },
    { label: 'Auto', value: 'auto', icon: MonitorSmartphone },
  ];
</script>

<div class="toggle">
  {#each options as option}
    <button
      type="button"
      class:selected={currentTheme === option.value}
      onclick={() => themeStore.setTheme(option.value)}
      title={option.label}
    >
      <option.icon size={16} />
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .toggle {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    border: 1px solid var(--aico-color-border-light);
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 65%, transparent);
    gap: 4px;
  }

  button {
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--aico-color-text-secondary);
    font-size: 0.8rem;
    font-weight: 600;
    padding: 6px 10px;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
    transition: var(--transition-button);
  }

  button.selected {
    background: color-mix(in srgb, var(--aico-color-bg-primary) 92%, transparent);
    color: var(--aico-color-text-primary);
    box-shadow: 0 6px 14px rgba(15, 23, 42, 0.12);
  }

  span {
    display: none;
  }

  @media (min-width: 720px) {
    span {
      display: inline;
    }
  }
</style>
