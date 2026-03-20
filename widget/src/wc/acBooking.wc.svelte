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

  let currentLocale = $state('en');
  const unsubLocale = locale.subscribe((value) => {
    currentLocale = value || 'en';
  });

  let api = $state(new BookingApi());
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
  let themeSetting = $state<ThemeSetting>('auto');
  let mediaQuery: MediaQueryList | null = null;

  const slotsByTime = $derived(sortSlotsByTime(availableSlots));

  onMount(() => {
    ensureI18n(widgetLocale);
    locale.set(widgetLocale);
    updateTheme(theme || 'auto');
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

  let lastOrgValue = '';
  let lastApiUrl = '';
  $effect(() => {
    if (!orgId) return;
    const nextOrg = orgId;
    const nextApi = apiUrl || '';
    if (nextOrg !== lastOrgValue || nextApi !== lastApiUrl) {
      lastOrgValue = nextOrg;
      lastApiUrl = nextApi;
      api = new BookingApi(nextApi);
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
      
      // Load available days for the calendar
      if (config) {
        await loadAvailableDays();
      }
    } catch (err: any) {
      error = err.message ?? get(t)('widget.errors.generic');
    } finally {
      loading = false;
    }
  }

  async function loadAvailableDays() {
    if (!orgId || !config) return;

    try {
      const today = new Date();
      const maxDate = addDays(today, config.advanceBookingDays);
      
      const dayStrings = await api.getAvailableDays({
        orgId,
        startDate: today,
        endDate: maxDate,
        durationMinutes: config.bookingDurationMinutes,
      });

      // Convert YYYY-MM-DD strings to Date objects
      availableDates = dayStrings.map(dateStr => {
        const [year, month, day] = dateStr.split('-').map(Number);
        return new Date(year, month - 1, day);
      });
    } catch (err: any) {
      // Don't show error to user - calendar will just show all days as available
      console.warn('Failed to load available days:', err);
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
      // Refresh available days when returning to calendar
      loadAvailableDays();
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
    loadAvailableDays();
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

  :host {
    display: block;
    width: 100%;
  }

  :global(:root) {
    font-family: var(--aico-font-family-default);
  }

  .booking-widget {
    width: 100%;
    max-width: 520px;
    margin: 0 auto;
    border-radius: var(--widget-radius-lg);
    padding: 2rem;
    background: var(--widget-surface-base);
    border: 1px solid var(--widget-border-subtle);
    box-shadow: var(--widget-shadow-glow);
    position: relative;
    overflow: hidden;
    color: var(--widget-text-body);
    display: flex;
    flex-direction: column;
    gap: 1.35rem;
    isolation: isolate;
    backdrop-filter: blur(14px);
    line-height: 1.5;
  }

  .booking-widget::before {
    content: '';
    position: absolute;
    inset: 0;
    background:
      radial-gradient(circle at 12% 0%, rgba(var(--brand-signal-rgb), 0.18), transparent 42%),
      radial-gradient(circle at 100% 0%, rgba(var(--brand-petrol-rgb), 0.2), transparent 46%);
    opacity: 0.85;
    pointer-events: none;
  }

  .widget-header {
    margin-bottom: 0.1rem;
    position: relative;
    z-index: 1;
  }

  .booking-widget button {
    font: inherit;
    line-height: 1.2;
    color: inherit;
    appearance: none;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.73rem;
    color: var(--widget-text-muted);
    margin: 0;
    font-weight: 600;
  }

  .widget-header h2 {
    margin: 0.2rem 0 0;
    font-size: clamp(1.45rem, 3vw, 1.85rem);
    line-height: 1.05;
    color: var(--widget-text-heading);
    letter-spacing: -0.03em;
  }

  .stepper {
    display: flex;
    gap: 0.55rem;
    margin-bottom: 0.9rem;
  }

  .step {
    flex: 1;
    height: 5px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--widget-border-subtle) 88%, transparent);
    position: relative;
    overflow: hidden;
  }

  .step.done,
  .step.active {
    background:
      linear-gradient(90deg, rgba(var(--brand-signal-rgb), 0.16), rgba(var(--brand-signal-rgb), 0)),
      var(--surface-gradient);
  }

  .error-banner {
    border-radius: 18px;
    padding: 0.9rem 1rem;
    background: linear-gradient(
      135deg,
      rgba(var(--aico-danger-rgb), 0.18),
      rgba(var(--brand-midnight-rgb), 0.32)
    );
    border: 1px solid rgba(var(--aico-danger-rgb), 0.34);
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
    color: var(--widget-text-danger);
    cursor: pointer;
    font-weight: 600;
  }

  .widget-body {
    min-height: 320px;
    position: relative;
    z-index: 1;
  }

  .time-pane header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.15rem;
    gap: 1rem;
  }

  .selected-date {
    font-weight: 600;
    color: var(--widget-text-heading);
    text-align: right;
    letter-spacing: -0.02em;
  }

  .time-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 0.9rem;
  }

  .summary-card {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    border-radius: var(--widget-radius-md);
    border: 1px solid var(--widget-border-strong);
    padding: 1.15rem 1.2rem;
    margin-bottom: 1.35rem;
    background: var(--widget-surface-panel);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .summary-card .label {
    font-size: 0.72rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--widget-text-muted);
  }

  .summary-card strong {
    display: block;
    margin-top: 0.35rem;
    color: var(--widget-text-heading);
    line-height: 1.35;
  }

  .ghost {
    border: 1px solid var(--widget-border-subtle);
    border-radius: 999px;
    padding: 0.55rem 1rem;
    min-height: var(--widget-control-height);
    background: var(--widget-surface-ghost);
    font-weight: 600;
    cursor: pointer;
    transition: var(--transition-button);
    color: var(--widget-button-secondary-text);
  }

  .ghost:hover {
    border-color: var(--widget-border-strong);
    box-shadow: var(--widget-shadow-float);
    transform: translateY(-1px);
  }

  .ghost:focus-visible {
    outline: 2px solid var(--widget-focus-ring);
    outline-offset: 2px;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    background: rgba(2, 6, 23, 0.48);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--widget-overlay-text);
    gap: 0.5rem;
    backdrop-filter: blur(4px);
  }

  .spinner {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.18);
    border-top-color: var(--brand-mint);
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
