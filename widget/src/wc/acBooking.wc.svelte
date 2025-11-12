<svelte:options customElement="ac-booking" />

<script lang="ts">
  'use runes';

  import { onMount, onDestroy } from 'svelte';
  import {
    BookingApi,
    type AvailabilitySlot,
    type BookingResult,
    type BookingConfig,
  } from './lib/bookingApi';
  import {
    startOfDay,
    endOfDay,
    addDays,
    formatDateFull,
    formatTimeRange,
    sortSlotsByTime,
  } from './lib/dateUtils';
  import Calendar from './components/Calendar.svelte';
  import TimeSlot from './components/TimeSlot.svelte';
  import BookingForm from './components/BookingForm.svelte';
  import Confirmation from './components/Confirmation.svelte';
  import { ensureI18n, t, locale } from '../i18n';
  import { get } from 'svelte/store';

  type Step = 'calendar' | 'time' | 'form' | 'confirmation';
  type ThemeSetting = 'light' | 'dark' | 'auto';

  interface Attributes {
    'org-id': string;
    'api-url'?: string;
    locale?: string;
    theme?: ThemeSetting;
  }

  let {
    'org-id': orgId,
    'api-url': apiUrl,
    locale: widgetLocale = 'en',
    theme = 'auto',
  }: Attributes = $props();

  ensureI18n(widgetLocale);
  locale.set(widgetLocale);

let currentLocale = $state(widgetLocale || 'en');
const unsubLocale = locale.subscribe((value) => {
  currentLocale = value || 'en';
});

let api = $state(new BookingApi(apiUrl));
$effect(() => {
  api = new BookingApi(apiUrl);
});

  let currentStep = $state<Step>('calendar');
  let selectedDate = $state<Date | null>(null);
  let selectedSlot = $state<AvailabilitySlot | null>(null);
  let availableSlots = $state<AvailabilitySlot[]>([]);
  let availableDates = $state<Date[]>([]);
  let config = $state<BookingConfig | null>(null);
  let visitorData = $state<{ name?: string; email: string; phone?: string; [key: string]: any }>({
    email: '',
  });
  let notes = $state('');
let bookingResult = $state<BookingResult | null>(null);
let loading = $state(false);
let error = $state<string | null>(null);

  let appliedTheme = $state<'light' | 'dark'>('light');
  let themeSetting = $state<ThemeSetting>(theme || 'auto');
  let mediaQuery: MediaQueryList | null = null;

  const slotsByTime = $derived(sortSlotsByTime(availableSlots));

  onMount(() => {
    ensureI18n(widgetLocale);
    locale.set(widgetLocale);
    updateTheme(themeSetting);
    setupMediaListener();
    loadConfig();
  });

  onDestroy(() => {
    unsubLocale();
    mediaQuery?.removeEventListener('change', handleSystemThemeChange);
  });

  function setupMediaListener() {
    if (typeof window === 'undefined') return;
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', handleSystemThemeChange);
  }

  function handleSystemThemeChange() {
    if (themeSetting === 'auto') {
      appliedTheme = mediaQuery?.matches ? 'dark' : 'light';
    }
  }

  function updateTheme(value: ThemeSetting) {
    themeSetting = value;
    if (value === 'auto') {
      appliedTheme = mediaQuery?.matches ? 'dark' : 'light';
    } else {
      appliedTheme = value;
    }
  }

  $effect(() => {
    const nextTheme = (theme as ThemeSetting) || 'auto';
    updateTheme(nextTheme);
  });

  $effect(() => {
    if (widgetLocale) {
      ensureI18n(widgetLocale);
      locale.set(widgetLocale);
    }
  });

  let lastOrgValue = orgId;
  let lastApiUrl = apiUrl;
  $effect(() => {
    if (!orgId) return;
    const nextOrg = orgId;
    const nextApi = apiUrl;
    if (nextOrg !== lastOrgValue || nextApi !== lastApiUrl) {
      lastOrgValue = nextOrg;
      lastApiUrl = nextApi;
      api = new BookingApi(apiUrl);
      loadConfig();
    }
  });

  async function loadConfig() {
    if (!orgId) {
      error = get(t)('widget.errors.missingOrg');
      return;
    }

    try {
      loading = true;
      error = null;
      config = await api.getConfig(orgId);
      
      // Load available dates for the calendar
      if (config) {
        await loadAvailableDates();
      }
    } catch (err: any) {
      error = err.message ?? get(t)('widget.errors.generic');
    } finally {
      loading = false;
    }
  }

  async function loadAvailableDates() {
    if (!config) return;

    try {
      const startDate = new Date();
      const endDate = addDays(new Date(), config.advanceBookingDays);

      const dateStrings = await api.getAvailableDates({
        orgId,
        startDate,
        endDate,
        durationMinutes: config.bookingDurationMinutes,
      });

      // Convert date strings (YYYY-MM-DD) to Date objects in local time
      availableDates = dateStrings.map(dateStr => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      });
    } catch (err: any) {
      // Don't show error to user, just log it
      console.warn('Failed to load available dates:', err);
      availableDates = [];
    }
  }

  async function handleDateSelect(date: Date) {
    selectedDate = date;
    selectedSlot = null;
    if (!config) return;

    try {
      loading = true;
      error = null;

      availableSlots = await api.getAvailability({
        orgId,
        startDate: startOfDay(date),
        endDate: endOfDay(date),
        durationMinutes: config.bookingDurationMinutes,
      });

      if (availableSlots.length === 0) {
        error = get(t)('widget.errors.noSlots');
      } else {
        currentStep = 'time';
      }
    } catch (err: any) {
      error = err.message ?? get(t)('widget.errors.generic');
    } finally {
      loading = false;
    }
  }

  function handleSlotSelect(slot: AvailabilitySlot) {
    selectedSlot = slot;
    currentStep = 'form';
  }

  function resetTo(step: Step) {
    if (step === 'calendar') {
      selectedDate = null;
      selectedSlot = null;
      availableSlots = [];
      // Reload available dates when going back to calendar
      loadAvailableDates();
    }
    if (step === 'time') {
      selectedSlot = null;
    }
    currentStep = step;
  }

  async function handleSubmitBooking() {
    if (!selectedSlot || !config) return;

    try {
      loading = true;
      error = null;
      bookingResult = await api.createBooking({
        userId: selectedSlot.userId,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        visitorData,
        notes,
      });
      currentStep = 'confirmation';
    } catch (err: any) {
      error = err.message ?? get(t)('widget.errors.generic');
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    currentStep = 'calendar';
    selectedDate = null;
    selectedSlot = null;
    bookingResult = null;
    visitorData = { email: '' };
    notes = '';
    error = null;
    // Reload available dates when closing
    loadAvailableDates();
  }

  const stepOrder: Step[] = ['calendar', 'time', 'form', 'confirmation'];
</script>

<div
  class="booking-widget"
  data-theme={appliedTheme}
  class:aico-dark={appliedTheme === 'dark'}
  class:nav-theme-light={appliedTheme === 'light'}
  class:nav-theme-dark={appliedTheme === 'dark'}
>
  <header class="widget-header">
    <div class="stepper">
      {#each stepOrder as step}
        <div class="step" class:active={step === currentStep} class:done={stepOrder.indexOf(step) < stepOrder.indexOf(currentStep)}>
          <span></span>
        </div>
      {/each}
    </div>
    <p class="eyebrow">{$t(`widget.steps.${currentStep}`)}</p>
    <h2>{$t(`widget.steps.${currentStep}`)}</h2>
  </header>

  {#if error}
    <div class="error-banner">
      <span>{error}</span>
      <button type="button" onclick={() => (error = null)}>{$t('actions.retry')}</button>
    </div>
  {/if}

  <div class="widget-body" aria-busy={loading}>
    {#if currentStep === 'calendar'}
      {#if config}
        <Calendar
          bind:selectedDate
          minDate={new Date()}
          maxDate={addDays(new Date(), config.advanceBookingDays)}
          availableDates={availableDates}
          onSelectDate={handleDateSelect}
          locale={currentLocale}
        />
      {/if}
    {:else if currentStep === 'time'}
      <div class="time-pane">
        <header>
          <button type="button" class="ghost" onclick={() => resetTo('calendar')}>
            {$t('actions.back')}
          </button>
          {#if selectedDate}
            <p class="selected-date">
              {formatDateFull(selectedDate, currentLocale)}
            </p>
          {/if}
        </header>

        {#if slotsByTime.length === 0}
          <p class="empty-copy">{$t('widget.emptySlots')}</p>
        {:else}
          <div class="time-grid">
            {#each slotsByTime as slot}
              <TimeSlot
                {slot}
                locale={currentLocale}
                selected={selectedSlot?.startTime === slot.startTime}
                onSelect={() => handleSlotSelect(slot)}
              />
            {/each}
          </div>
        {/if}
      </div>

    {:else if currentStep === 'form'}
      <div class="form-pane">
        <header class="summary-card">
          <div>
            <p class="label">{$t('widget.labels.selectedDate')}</p>
            <strong>{selectedDate ? formatDateFull(selectedDate, currentLocale) : '—'}</strong>
          </div>
          <div>
            <p class="label">{$t('widget.labels.with')}</p>
            <strong>{selectedSlot?.userName}</strong>
          </div>
          <div>
            <p class="label">{$t('widget.labels.time')}</p>
            <strong>
              {selectedSlot
                ? formatTimeRange(new Date(selectedSlot.startTime), new Date(selectedSlot.endTime), currentLocale)
                : '—'}
            </strong>
          </div>
        </header>

        {#if config && selectedSlot}
          <BookingForm
            {config}
            bind:visitorData
            bind:notes
            onSubmit={handleSubmitBooking}
            onBack={() => resetTo('time')}
            submitting={loading}
          />
        {/if}
      </div>

    {:else if currentStep === 'confirmation'}
      {#if bookingResult && selectedSlot}
        <Confirmation
          booking={bookingResult}
          userName={selectedSlot.userName}
          locale={currentLocale}
          onClose={handleClose}
        />
      {/if}
    {/if}
  </div>

  {#if loading}
    <div class="loading-overlay">
      <div class="spinner"></div>
      <span>{$t('widget.loading')}</span>
    </div>
  {/if}
</div>

<style>
  @import '../theme.css';

  :global(:root) {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }

  .booking-widget {
    width: min(520px, 100%);
    border-radius: 32px;
    padding: 2rem;
    background: color-mix(in srgb, var(--aico-color-bg-primary) 96%, transparent);
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 80%, transparent);
    box-shadow: 0 40px 80px rgba(15, 23, 42, 0.18);
    position: relative;
    overflow: hidden;
    color: var(--aico-color-text-primary);
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    isolation: isolate;
  }

  .booking-widget::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 15% 0%, rgba(var(--aico-mint-rgb), 0.18), transparent 55%);
    opacity: 0.9;
    pointer-events: none;
  }

  .widget-header {
    margin-bottom: 0.25rem;
    position: relative;
    z-index: 1;
  }

  .booking-widget button {
    font: inherit;
    line-height: 1.2;
    color: var(--aico-color-text-primary);
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.1em;
    font-size: 0.75rem;
    color: var(--aico-color-text-tertiary);
    margin: 0;
  }

  .widget-header h2 {
    margin: 0.2rem 0 0;
    font-size: clamp(1.2rem, 3vw, 1.6rem);
  }

  .stepper {
    display: flex;
    gap: 0.4rem;
    margin-bottom: 0.65rem;
  }

  .step {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--aico-color-border-light) 80%, transparent);
    position: relative;
  }

  .step.done,
  .step.active {
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
  }

  .error-banner {
    border-radius: 16px;
    padding: 0.75rem 1rem;
    background: color-mix(in srgb, rgba(var(--aico-danger-rgb), 0.18), transparent);
    border: 1px solid color-mix(in srgb, rgba(var(--aico-danger-rgb), 0.45), transparent);
    font-size: 0.9rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .error-banner button {
    border: none;
    background: transparent;
    color: var(--aico-danger);
    cursor: pointer;
    font-weight: 600;
  }

  .widget-body {
    min-height: 320px;
    position: relative;
  }

  .time-pane header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .selected-date {
    font-weight: 600;
  }

  .time-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.75rem;
  }

  .summary-card {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    border-radius: 18px;
    border: 1px solid var(--aico-color-border-light);
    padding: 1rem;
    margin-bottom: 1.2rem;
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
  }

  .summary-card .label {
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--aico-color-text-tertiary);
  }

  .summary-card strong {
    display: block;
    margin-top: 0.35rem;
  }

  .ghost {
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 80%, transparent);
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
  }

  .ghost:hover {
    border-color: color-mix(in srgb, var(--aico-mint) 35%, var(--aico-color-border-light));
    box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
  }

  .ghost:focus-visible {
    outline: 2px solid rgba(var(--aico-mint-rgb), 0.5);
    outline-offset: 2px;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(15, 23, 42, 0.4);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: white;
    gap: 0.5rem;
    backdrop-filter: blur(4px);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.25);
    border-top-color: white;
    animation: spin 0.9s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (max-width: 520px) {
    .booking-widget {
      padding: 1.5rem;
      border-radius: 24px;
    }
  }

</style>
