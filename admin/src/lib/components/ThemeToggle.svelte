<script lang="ts">
  import { themeStore, type Theme } from '../stores/theme';
  import { SunMedium, Moon, Monitor } from '@lucide/svelte';
  import { onDestroy } from 'svelte';

  let currentTheme = $state<Theme>('auto');

  const unsubscribe = themeStore.subscribe((value) => {
    currentTheme = value;
  });

  onDestroy(() => {
    unsubscribe();
  });

  function handleChange(theme: Theme) {
    themeStore.setTheme(theme);
  }

  const options: { label: string; value: Theme; icon: typeof SunMedium }[] = [
    { label: 'Light', value: 'light', icon: SunMedium },
    { label: 'Dark', value: 'dark', icon: Moon },
    { label: 'Auto', value: 'auto', icon: Monitor },
  ];
</script>

<div class="theme-toggle" role="group" aria-label="Theme toggle">
  {#each options as option}
    {@const Icon = option.icon}
    <button
      type="button"
      class:selected={currentTheme === option.value}
      onclick={() => handleChange(option.value)}
      title={option.label}
    >
      <Icon size={16} />
      <span>{option.label}</span>
    </button>
  {/each}
</div>

<style>
  .theme-toggle {
    display: inline-flex;
    padding: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
    border: 1px solid var(--aico-color-border-light);
    gap: 4px;
  }

  button {
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--aico-color-text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    transition: var(--transition-button);
  }

  button:hover {
    color: var(--aico-color-text-primary);
  }

  button.selected {
    background: var(--aico-color-bg-primary);
    color: var(--aico-color-text-primary);
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08);
  }

  span {
    display: none;
  }

  @media (min-width: 768px) {
    span {
      display: inline;
    }
  }
</style>
