<script lang="ts">
  'use runes';
  import {
    getCalendarDates,
    getMonthName,
    isSameDay,
    isToday,
    isPast,
    getWeekdayLabels,
  } from '../lib/dateUtils';

  export interface Props {
    selectedDate: Date | null;
    minDate?: Date;
    maxDate?: Date;
    availableDates?: Date[];
    locale?: string;
    onSelectDate: (date: Date) => void;
  }

  let {
    selectedDate = $bindable(null),
    minDate,
    maxDate,
    availableDates = [],
    locale = 'en',
    onSelectDate,
  }: Props = $props();

  let currentMonth = $state(new Date().getMonth());
  let currentYear = $state(new Date().getFullYear());

  let weekDays = $derived(getWeekdayLabels(locale, 'short'));
  let calendarDates = $derived(getCalendarDates(currentYear, currentMonth));
  let monthName = $derived(getMonthName(currentMonth, locale));

  function previousMonth() {
    if (currentMonth === 0) {
      currentMonth = 11;
      currentYear--;
    } else {
      currentMonth--;
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      currentMonth = 0;
      currentYear++;
    } else {
      currentMonth++;
    }
  }

  function selectDate(date: Date) {
    if (isDateDisabled(date)) return;
    selectedDate = date;
    onSelectDate(date);
  }

  function isDateDisabled(date: Date): boolean {
    if (isPast(date)) return true;
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;

    if (availableDates.length > 0) {
      return !availableDates.some((d) => isSameDay(d, date));
    }

    return false;
  }

  function isInCurrentMonth(date: Date): boolean {
    return date.getMonth() === currentMonth;
  }
</script>

<div class="calendar">
  <div class="calendar-header">
    <button class="nav-button" onclick={previousMonth} type="button">‹</button>
    <h3 class="month-year">{monthName} {currentYear}</h3>
    <button class="nav-button" onclick={nextMonth} type="button">›</button>
  </div>

  <div class="calendar-grid">
    {#each weekDays as day}
      <div class="weekday">{day}</div>
    {/each}

    {#each calendarDates as date}
      <button
        class="day"
        class:selected={selectedDate && isSameDay(date, selectedDate)}
        class:today={isToday(date)}
        class:disabled={isDateDisabled(date)}
        class:other-month={!isInCurrentMonth(date)}
        onclick={() => selectDate(date)}
        type="button"
      >
        {date.getDate()}
      </button>
    {/each}
  </div>
</div>

<style>

  .calendar {
    border-radius: var(--widget-radius-md);
    padding: 1.55rem;
    border: 1px solid var(--widget-border-subtle);
    background: var(--widget-surface-panel);
    box-shadow: var(--widget-shadow-card);
    color: var(--widget-text-heading);
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .month-year {
    margin: 0;
    font-size: 1.22rem;
    letter-spacing: -0.03em;
    color: var(--widget-text-heading);
  }

  .nav-button {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid var(--widget-border-subtle);
    background: var(--widget-surface-ghost);
    cursor: pointer;
    font-size: 1.25rem;
    color: var(--widget-text-heading);
    transition: var(--transition-button);
  }

  .nav-button:hover {
    border-color: var(--widget-border-strong);
    box-shadow: var(--widget-shadow-float);
    transform: translateY(-1px);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 10px;
  }

  .weekday {
    text-align: center;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--widget-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }

  .day {
    aspect-ratio: 1;
    border: 1px solid rgba(0, 0, 0, 0);
    border-radius: var(--widget-radius-sm);
    background: color-mix(in srgb, var(--widget-surface-field) 75%, transparent);
    cursor: pointer;
    font-weight: 600;
    transition: var(--transition-all);
    color: var(--widget-text-heading);
  }

  .day:hover:not(.disabled) {
    background: color-mix(in srgb, var(--brand-petrol) 18%, var(--widget-surface-field));
    border-color: var(--widget-border-subtle);
    transform: translateY(-1px);
  }

  .day.today {
    border-color: rgba(var(--brand-signal-rgb), 0.34);
    box-shadow: inset 0 0 0 1px rgba(var(--brand-signal-rgb), 0.18);
  }

  .day.selected {
    background: var(--surface-gradient);
    color: var(--widget-button-primary-text);
    border-color: rgba(var(--brand-signal-rgb), 0.2);
    box-shadow: 0 14px 24px rgba(var(--brand-petrol-rgb), 0.24);
  }

  .day.disabled {
    opacity: 0.32;
    cursor: not-allowed;
  }

  .day.other-month {
    opacity: 0.3;
  }
</style>
