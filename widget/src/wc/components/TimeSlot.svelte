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
    padding: 0.95rem 1rem;
    min-height: 84px;
    border-radius: var(--widget-radius-sm);
    border: 1px solid var(--widget-border-subtle);
    background: var(--widget-surface-panel);
    text-align: left;
    cursor: pointer;
    transition: var(--transition-all);
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
    color: var(--widget-text-heading);
    box-shadow: 0 10px 22px rgba(var(--brand-midnight-rgb), 0.14);
  }

  .time-slot:hover {
    border-color: var(--widget-border-strong);
    box-shadow: var(--widget-shadow-float);
    transform: translateY(-1px);
  }

  .time-slot.selected {
    background: var(--surface-gradient);
    color: var(--widget-button-primary-text);
    border-color: rgba(var(--brand-signal-rgb), 0.24);
    box-shadow: 0 18px 32px rgba(var(--brand-petrol-rgb), 0.35);
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
    color: rgba(248, 250, 252, 0.76);
  }
</style>
