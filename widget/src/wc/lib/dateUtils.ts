/**
 * Date and time utilities for the booking widget
 * 
 * IMPORTANT: All date/time handling uses UTC to ensure consistency
 * between the frontend widget and backend API.
 */

const DEFAULT_LOCALE = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

const resolveLocale = (locale?: string) => locale || DEFAULT_LOCALE;

/**
 * Format date to display format (e.g., "Mon, Jan 15")
 */
export function formatDate(date: Date, locale?: string): string {
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format date to full display format (e.g., "Monday, January 15, 2024")
 */
export function formatDateFull(date: Date, locale?: string): string {
  return date.toLocaleDateString(resolveLocale(locale), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format time to display format (e.g., "2:30 PM")
 */
export function formatTime(date: Date, locale?: string): string {
  return date.toLocaleTimeString(resolveLocale(locale), {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/**
 * Format time range (e.g., "2:30 PM - 3:00 PM")
 */
export function formatTimeRange(start: Date, end: Date, locale?: string): string {
  return `${formatTime(start, locale)} - ${formatTime(end, locale)}`;
}

/**
 * Get array of dates for a month view
 */
export function getCalendarDates(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  
  // Get day of week (0 = Sunday)
  const startDay = firstDay.getDay();
  const endDay = lastDay.getDay();
  
  const dates: Date[] = [];
  
  // Add previous month's trailing days
  for (let i = startDay - 1; i >= 0; i--) {
    dates.push(new Date(year, month, -i));
  }
  
  // Add current month's days
  for (let i = 1; i <= lastDay.getDate(); i++) {
    dates.push(new Date(year, month, i));
  }
  
  // Add next month's leading days
  for (let i = 1; i < 7 - endDay; i++) {
    dates.push(new Date(year, month + 1, i));
  }
  
  return dates;
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return date1.getFullYear() === date2.getFullYear() &&
         date1.getMonth() === date2.getMonth() &&
         date1.getDate() === date2.getDate();
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

/**
 * Get start of day (midnight) in UTC
 * 
 * This function takes a local date and returns the start of that calendar day in UTC.
 * Example: User selects "Nov 13 2025" -> Returns "2025-11-13T00:00:00.000Z"
 * 
 * This ensures that when querying the API for a specific day's slots,
 * we get all slots for that calendar day regardless of timezone.
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0));
}

/**
 * Get end of day (23:59:59.999) in UTC
 * 
 * This function takes a local date and returns the end of that calendar day in UTC.
 * Example: User selects "Nov 13 2025" -> Returns "2025-11-13T23:59:59.999Z"
 * 
 * This ensures complete day coverage when querying the API.
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999));
}

/**
 * Add days to a date
 */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get month name
 */
export function getMonthName(month: number, locale?: string): string {
  return new Date(2000, month, 1).toLocaleDateString(resolveLocale(locale), { month: 'long' });
}

export function getWeekdayLabels(locale?: string, format: 'short' | 'narrow' = 'short'): string[] {
  const labels: string[] = [];
  const formatter = new Intl.DateTimeFormat(resolveLocale(locale), { weekday: format, timeZone: 'UTC' });
  for (let day = 0; day < 7; day++) {
    const date = new Date(Date.UTC(2021, 5, 6 + day)); // Sunday start
    labels.push(formatter.format(date));
  }
  return labels;
}

/**
 * Group time slots by date
 */
export function groupSlotsByDate<T extends { startTime: string }>(slots: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  
  for (const slot of slots) {
    const date = startOfDay(new Date(slot.startTime));
    const key = date.toISOString();
    
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(slot);
  }
  
  return grouped;
}

/**
 * Sort time slots by start time
 */
export function sortSlotsByTime<T extends { startTime: string }>(slots: T[]): T[] {
  return [...slots].sort((a, b) => 
    new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );
}

/**
 * Generate calendar event (.ics) content
 */
export function generateICSContent(params: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const formatICSDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${formatICSDate(params.startTime)}`,
    `DTEND:${formatICSDate(params.endTime)}`,
    `SUMMARY:${params.title}`,
    ...(params.description ? [`DESCRIPTION:${params.description}`] : []),
    ...(params.location ? [`LOCATION:${params.location}`] : []),
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  return lines.join('\r\n');
}

/**
 * Get Google Calendar add link
 */
export function getGoogleCalendarLink(params: {
  title: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  location?: string;
}): string {
  const formatGoogleDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const query = new URLSearchParams({
    action: 'TEMPLATE',
    text: params.title,
    dates: `${formatGoogleDate(params.startTime)}/${formatGoogleDate(params.endTime)}`,
    ...(params.description && { details: params.description }),
    ...(params.location && { location: params.location })
  });

  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}
