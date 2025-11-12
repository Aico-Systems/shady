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
    border-radius: 24px;
    padding: 1.5rem;
    border: 1px solid var(--aico-color-border-light);
    background: color-mix(in srgb, var(--aico-color-bg-primary) 96%, transparent);
    box-shadow: 0 20px 40px rgba(15, 23, 42, 0.12);
    color: var(--aico-color-text-primary);
  }

  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.25rem;
  }

  .month-year {
    margin: 0;
    font-size: 1.25rem;
  }

  .nav-button {
    width: 40px;
    height: 40px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--aico-color-border-light) 75%, transparent);
    background: color-mix(in srgb, var(--aico-color-bg-secondary) 70%, transparent);
    cursor: pointer;
    font-size: 1.25rem;
    color: var(--aico-color-text-primary);
    transition: var(--transition-button);
  }

  .nav-button:hover {
    border-color: color-mix(in srgb, var(--aico-mint) 35%, var(--aico-color-border-light));
    box-shadow: 0 10px 18px rgba(15, 23, 42, 0.12);
  }

  .calendar-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 10px;
  }

  .weekday {
    text-align: center;
    font-size: 0.8rem;
    font-weight: 600;
    color: var(--aico-color-text-tertiary);
  }

  .day {
    aspect-ratio: 1;
    border: 1px solid transparent;
    border-radius: 14px;
    background: transparent;
    cursor: pointer;
    font-weight: 600;
    transition: var(--transition-all);
    color: var(--aico-color-text-primary);
  }

  .day:hover:not(.disabled) {
    background: color-mix(in srgb, var(--aico-mint) 8%, transparent);
  }

  .day.today {
    border-color: color-mix(in srgb, var(--aico-mint) 45%, transparent);
  }

  .day.selected {
    background: linear-gradient(135deg, var(--aico-mint), var(--aico-flieder));
    color: white;
  }

  .day.disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .day.other-month {
    opacity: 0.35;
  }
</style>
