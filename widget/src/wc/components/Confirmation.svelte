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
    gap: 1.1rem;
    color: var(--widget-text-body);
  }

  .icon {
    width: 72px;
    height: 72px;
    border-radius: 24px;
    margin: 0 auto;
    background: var(--surface-gradient);
    color: var(--widget-button-primary-text);
    font-size: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 20px 36px rgba(var(--brand-petrol-rgb), 0.28);
  }

  h3 {
    margin: 0;
    color: var(--widget-text-heading);
    font-size: 1.4rem;
    letter-spacing: -0.03em;
  }

  p {
    margin: 0;
  }

  .details {
    border-radius: var(--widget-radius-md);
    border: 1px solid var(--widget-border-subtle);
    padding: 1.5rem;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    background: var(--widget-surface-panel);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  }

  .label {
    display: block;
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--widget-text-muted);
    margin-bottom: 0.3rem;
  }

  .details strong {
    color: var(--widget-text-heading);
    line-height: 1.35;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .details a {
    color: var(--widget-text-accent);
    font-weight: 600;
    text-decoration: none;
  }

  .actions button {
    border-radius: 999px;
    border: 1px solid var(--widget-border-subtle);
    padding: 0.75rem;
    min-height: var(--widget-control-height);
    background: var(--widget-surface-ghost);
    color: var(--widget-button-secondary-text);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
  }

  .actions button:hover {
    border-color: var(--widget-border-strong);
    box-shadow: var(--widget-shadow-float);
    transform: translateY(-1px);
  }

  .primary {
    border: none;
    border-radius: 999px;
    padding: 0.75rem;
    min-height: var(--widget-control-height);
    background: var(--surface-gradient);
    color: var(--widget-button-primary-text);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
  }

  .primary:hover {
    box-shadow: 0 15px 30px rgba(var(--brand-petrol-rgb), 0.3);
  }
</style>
