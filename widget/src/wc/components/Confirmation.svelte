<script lang="ts">
  'use runes';
import {
  formatDateFull,
  formatTimeRange,
  getGoogleCalendarLink,
  generateICSContent,
} from '../lib/dateUtils';
import type { BookingResult } from '../lib/bookingApi';
import { t } from '../../i18n';
import { get } from 'svelte/store';

  export interface Props {
    booking: BookingResult;
    userName: string;
    locale: string;
    onClose: () => void;
  }

  let { booking, userName, locale = 'en', onClose }: Props = $props();

  const startTime = $derived(new Date(booking.startTime));
  const endTime = $derived(new Date(booking.endTime));

  function downloadICS() {
    const translator = get(t);
    const content = generateICSContent({
      title: `${translator('widget.confirmation.with')} ${userName}`,
      description: booking.googleMeetLink ? `Join: ${booking.googleMeetLink}` : undefined,
      startTime,
      endTime,
      location: booking.googleMeetLink,
    });

    const blob = new Blob([content], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'booking.ics';
    a.click();
    URL.revokeObjectURL(url);
  }

  function addToGoogleCalendar() {
    const translator = get(t);
    const link = getGoogleCalendarLink({
      title: `${translator('widget.confirmation.with')} ${userName}`,
      description: booking.googleMeetLink ? `Join: ${booking.googleMeetLink}` : undefined,
      startTime,
      endTime,
      location: booking.googleMeetLink,
    });
    window.open(link, '_blank');
  }
</script>

<div class="confirmation">
  <div class="icon">✓</div>
  <h3>{$t('widget.confirmation.title')}</h3>
  <p>{$t('widget.confirmation.subtitle')}</p>

  <div class="details">
    <div>
      <p class="label">{$t('widget.confirmation.date')}</p>
      <strong>{formatDateFull(startTime, locale)}</strong>
    </div>
    <div>
      <p class="label">{$t('widget.confirmation.time')}</p>
      <strong>{formatTimeRange(startTime, endTime, locale)}</strong>
    </div>
    <div>
      <p class="label">{$t('widget.confirmation.with')}</p>
      <strong>{userName}</strong>
    </div>
    {#if booking.googleMeetLink}
      <div>
        <p class="label">{$t('widget.labels.meetingLink')}</p>
        <a href={booking.googleMeetLink} target="_blank" rel="noreferrer">
          {$t('widget.labels.meetingLink')}
        </a>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button type="button" onclick={addToGoogleCalendar}>
      {$t('widget.labels.addGoogle')}
    </button>
    <button type="button" onclick={downloadICS}>
      {$t('widget.labels.downloadIcs')}
    </button>
  </div>

  <button class="primary" type="button" onclick={onClose}>
    {$t('actions.done')}
  </button>
</div>

<style>

  .confirmation {
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--aico-color-text-primary);
  }

  .icon {
    width: 64px;
    height: 64px;
    border-radius: 20px;
    margin: 0 auto;
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .details {
    border-radius: 18px;
    border: 1px solid var(--aico-color-border-light);
    padding: 1.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
  }

  .label {
    display: block;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--aico-color-text-tertiary);
    margin-bottom: 0.3rem;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .details a {
    color: var(--aico-mint);
    font-weight: 600;
    text-decoration: none;
  }

  .actions button {
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 80%, transparent);
    padding: 0.75rem;
    background: color-mix(in srgb, var(--aico-color-bg-primary) 92%, transparent);
    color: var(--aico-color-text-primary);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
  }

  .actions button:hover {
    border-color: color-mix(in srgb, var(--aico-mint) 35%, var(--aico-color-border-light));
  }

  .primary {
    border: none;
    border-radius: 999px;
    padding: 0.75rem;
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
  }

  .primary:hover {
    box-shadow: 0 15px 30px rgba(var(--aico-mint-rgb), 0.35);
  }
</style>
