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
    padding: 0.85rem;
    border-radius: 16px;
    border: 1px solid var(--aico-color-border-light);
    background: color-mix(in srgb, var(--aico-color-bg-primary) 96%, transparent);
    text-align: left;
    cursor: pointer;
    transition: var(--transition-all);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: var(--aico-color-text-primary);
    box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
  }

  .time-slot:hover {
    border-color: color-mix(in srgb, var(--aico-mint) 30%, var(--aico-color-border-light));
    box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
  }

  .time-slot.selected {
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    border-color: transparent;
    box-shadow: 0 18px 32px rgba(var(--aico-mint-rgb), 0.4);
  }

  .time {
    font-size: 1rem;
    font-weight: 600;
  }

  .user {
    font-size: 0.85rem;
    opacity: 0.8;
  }
</style>
