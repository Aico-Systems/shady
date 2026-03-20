<script lang="ts">
  'use runes';
  import { formatTime } from '../lib/dateUtils';
  import type { AvailabilitySlot } from '../lib/bookingApi';

  export interface Props {
    slot: AvailabilitySlot;
    selected?: boolean;
    locale?: string;
    onSelect: () => void;
  }

  let { slot, selected = false, locale = 'en', onSelect }: Props = $props();
</script>

<button class="time-slot" class:selected onclick={onSelect} type="button">
  <div class="time">{formatTime(new Date(slot.startTime), locale)}</div>
  <div class="user">{slot.userName}</div>
</button>

<style>

  .time-slot {
    width: 100%;
    padding: 0.9rem 1rem;
    min-height: 76px;
    border-radius: var(--widget-radius-sm);
    border: 1px solid var(--widget-button-secondary-border);
    background: var(--widget-button-secondary-bg);
    text-align: left;
    cursor: pointer;
    transition: var(--transition-all);
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    color: var(--widget-text-heading);
    box-shadow: none;
  }

  .time-slot:hover {
    border-color: var(--widget-button-secondary-border-hover);
    background: var(--widget-button-secondary-bg-hover);
  }

  .time-slot.selected {
    background: var(--widget-button-primary-bg);
    color: var(--widget-button-primary-text);
    border-color: color-mix(in srgb, var(--widget-button-primary-bg) 80%, transparent);
  }

  .time {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  .user {
    font-size: 0.82rem;
    color: var(--widget-text-muted);
    font-weight: 600;
    line-height: 1.35;
  }

  .time-slot.selected .user {
    color: color-mix(in srgb, var(--widget-button-primary-text) 76%, transparent);
  }
</style>
