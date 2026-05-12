import { eq, and, lt, gt, inArray } from 'drizzle-orm';
import { db } from '../db';
import { bookingUsers, availabilityRules, bookings, bookingConfigs } from '../db/schema';
import { googleCalendarService } from './GoogleCalendarService';
import { getLogger } from '../logger';
import { config } from '../config';

const logger = getLogger('AvailabilityService');

export interface TimeSlot {
  startTime: Date;
  endTime: Date;
  userId: string;
  userName: string;
  userEmail: string;
}

export interface CalendarFetchError {
  userId: string;
  message: string;
}

export interface AvailabilityResult {
  slots: TimeSlot[];
  calendarErrors: CalendarFetchError[];
}

export interface AvailabilityOptions {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  durationMinutes?: number;
}

interface ZonedDateParts {
  year: number;
  month: number; // 1..12
  day: number;
  dayOfWeek: number; // 0=Sun..6=Sat
}

interface CacheEntry {
  data: Array<{ start: Date; end: Date }>;
  expiresAt: number;
}

type BookingUser = typeof bookingUsers.$inferSelect;

export class AvailabilityService {
  private googleCalendarCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60 * 1000;

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.googleCalendarCache.entries()) {
        if (entry.expiresAt <= now) this.googleCalendarCache.delete(key);
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Get all available time slots across all users in an organization,
   * plus a list of users whose Google Calendar fetch failed (so callers
   * can surface "broken calendar connection" instead of silently treating
   * the user as fully free).
   */
  async getAvailableSlots(options: AvailabilityOptions): Promise<AvailabilityResult> {
    const { organizationId, startDate, endDate, durationMinutes } = options;
    const startTimeMs = Date.now();

    const orgConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });

    const duration = durationMinutes || orgConfig?.bookingDurationMinutes || config.DEFAULT_BOOKING_DURATION_MINUTES;
    const bufferMinutes = orgConfig?.bufferMinutes || 0;

    const users = await db.query.bookingUsers.findMany({
      where: and(
        eq(bookingUsers.organizationId, organizationId),
        eq(bookingUsers.isActive, true)
      )
    });

    if (users.length === 0) {
      logger.warn('No active booking users found', { organizationId });
      return { slots: [], calendarErrors: [] };
    }

    const userIds = users.map(u => u.id);

    const allRules = await db.query.availabilityRules.findMany({
      where: and(
        inArray(availabilityRules.bookingUserId, userIds),
        eq(availabilityRules.isActive, true)
      )
    });

    const rulesByUser = new Map<string, typeof availabilityRules.$inferSelect[]>();
    for (const rule of allRules) {
      if (!rulesByUser.has(rule.bookingUserId)) rulesByUser.set(rule.bookingUserId, []);
      rulesByUser.get(rule.bookingUserId)!.push(rule);
    }

    const allBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.bookingUserId, userIds),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endTime, startDate),
        lt(bookings.startTime, endDate)
      )
    });

    const bookingsByUser = new Map<string, typeof bookings.$inferSelect[]>();
    for (const booking of allBookings) {
      if (!bookingsByUser.has(booking.bookingUserId)) bookingsByUser.set(booking.bookingUserId, []);
      bookingsByUser.get(booking.bookingUserId)!.push(booking);
    }

    const usersWithCalendar = users.filter(u => u.googleCalendarId && u.googleRefreshToken);
    const { busyByUser, errors } = await this.batchFetchGoogleCalendarBusyTimes(
      usersWithCalendar,
      startDate,
      endDate
    );

    const allSlots = users.flatMap(user => {
      const userRules = rulesByUser.get(user.id) || [];
      if (userRules.length === 0) return [];

      const tz = user.timezone || 'UTC';
      const potentialSlots = this.generateSlotsFromRules(userRules, startDate, endDate, duration, tz);
      if (potentialSlots.length === 0) return [];

      const userBookings = bookingsByUser.get(user.id) || [];
      const googleEvents = busyByUser.get(user.id) || [];
      const busyTimes = [
        ...userBookings.map(b => ({ start: b.startTime, end: b.endTime })),
        ...googleEvents
      ];

      return potentialSlots
        .filter(slot => {
          const slotStart = new Date(slot.startTime.getTime() - bufferMinutes * 60000);
          const slotEnd = new Date(slot.endTime.getTime() + bufferMinutes * 60000);
          return !busyTimes.some(busy => this.timesOverlap(slotStart, slotEnd, busy.start, busy.end));
        })
        .map(slot => ({
          ...slot,
          userId: user.id,
          userName: user.displayName,
          userEmail: user.email
        }));
    });

    allSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    logger.debug('Availability calculated', {
      organizationId,
      userCount: users.length,
      ruleCount: allRules.length,
      bookingCount: allBookings.length,
      googleCalendarUsers: usersWithCalendar.length,
      calendarErrors: errors.length,
      totalSlots: allSlots.length,
      elapsedMs: Date.now() - startTimeMs
    });

    return { slots: allSlots, calendarErrors: errors };
  }

  /**
   * Batch fetch Google Calendar busy times for multiple users.
   * Returns both the busy-time map and any per-user errors so callers can
   * surface broken calendar connections (instead of silently showing the
   * user as fully free).
   */
  private async batchFetchGoogleCalendarBusyTimes(
    users: BookingUser[],
    startDate: Date,
    endDate: Date
  ): Promise<{
    busyByUser: Map<string, Array<{ start: Date; end: Date }>>;
    errors: CalendarFetchError[];
  }> {
    const busyByUser = new Map<string, Array<{ start: Date; end: Date }>>();
    const errors: CalendarFetchError[] = [];
    if (users.length === 0) return { busyByUser, errors };

    const now = Date.now();
    const usersToFetch: BookingUser[] = [];

    for (const user of users) {
      const cacheKey = `${user.id}:${startDate.toISOString()}:${endDate.toISOString()}`;
      const cached = this.googleCalendarCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        busyByUser.set(user.id, cached.data);
      } else {
        if (cached) this.googleCalendarCache.delete(cacheKey);
        usersToFetch.push(user);
      }
    }

    if (usersToFetch.length === 0) {
      return { busyByUser, errors };
    }

    const CONCURRENT_REQUESTS = 10;
    for (let i = 0; i < usersToFetch.length; i += CONCURRENT_REQUESTS) {
      const chunk = usersToFetch.slice(i, i + CONCURRENT_REQUESTS);

      const results = await Promise.allSettled(
        chunk.map(async (user) => {
          const tz = user.timezone || 'UTC';
          const events = await googleCalendarService.getCalendarEvents(user.id, startDate, endDate);
          const busyTimes = this.eventsToBusyTimes(events, tz);
          return { userId: user.id, busyTimes };
        })
      );

      for (let j = 0; j < results.length; j++) {
        const promiseResult = results[j];
        const user = chunk[j];
        if (promiseResult.status === 'fulfilled') {
          const { userId, busyTimes } = promiseResult.value;
          busyByUser.set(userId, busyTimes);
          const cacheKey = `${userId}:${startDate.toISOString()}:${endDate.toISOString()}`;
          this.googleCalendarCache.set(cacheKey, {
            data: busyTimes,
            expiresAt: now + this.CACHE_TTL_MS
          });
          this.recordCalendarHealth(user.id, null).catch((err) =>
            logger.warn('Failed to clear calendar health', { userId: user.id, error: err })
          );
        } else {
          const message = promiseResult.reason instanceof Error
            ? promiseResult.reason.message
            : String(promiseResult.reason);
          // Error level: silent failures here cause "always fully available" UX;
          // operators need to see this in logs.
          logger.error('Google Calendar fetch failed for user', { userId: user.id, message });
          errors.push({ userId: user.id, message });
          busyByUser.set(user.id, []);
          this.recordCalendarHealth(user.id, message).catch((err) =>
            logger.warn('Failed to record calendar health', { userId: user.id, error: err })
          );
        }
      }
    }

    return { busyByUser, errors };
  }

  /**
   * Convert Google Calendar events into busy time ranges.
   * Includes all-day events (Out-of-Office, vacation) — these are anchored
   * to the user's timezone for the start/end-of-day boundaries.
   */
  private eventsToBusyTimes(
    events: Awaited<ReturnType<typeof googleCalendarService.getCalendarEvents>>,
    tz: string
  ): Array<{ start: Date; end: Date }> {
    const out: Array<{ start: Date; end: Date }> = [];
    for (const event of events) {
      if (event.status === 'cancelled') continue;
      if (event.transparency === 'transparent') continue;

      const startDateTime = event.start?.dateTime;
      const endDateTime = event.end?.dateTime;
      if (startDateTime && endDateTime) {
        out.push({ start: new Date(startDateTime), end: new Date(endDateTime) });
        continue;
      }

      const startDate = event.start?.date;
      const endDate = event.end?.date;
      if (startDate && endDate) {
        // Google's all-day end.date is exclusive (next-day midnight).
        const [sy, sm, sd] = startDate.split('-').map(Number);
        const [ey, em, ed] = endDate.split('-').map(Number);
        out.push({
          start: this.zonedTimeToUtc(sy, sm, sd, 0, 0, tz),
          end: this.zonedTimeToUtc(ey, em, ed, 0, 0, tz)
        });
      }
    }
    return out;
  }

  /**
   * Generate potential time slots from availability rules, anchored in the
   * user's timezone. A rule "Mon 09:00-17:00" with tz=Europe/Berlin produces
   * slots at 09:00 Berlin local, not 09:00 UTC.
   */
  private generateSlotsFromRules(
    rules: typeof availabilityRules.$inferSelect[],
    rangeStart: Date,
    rangeEnd: Date,
    durationMinutes: number,
    timezone: string
  ): Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] {
    const rulesByDow = new Map<number, typeof rules>();
    for (const rule of rules) {
      if (!rulesByDow.has(rule.dayOfWeek)) rulesByDow.set(rule.dayOfWeek, []);
      rulesByDow.get(rule.dayOfWeek)!.push(rule);
    }

    const slots: Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] = [];
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const seenLocalDates = new Set<string>();

    // Probe one day before/after to catch boundary cases where the user-local
    // calendar day overlaps the UTC range only at its edges.
    for (let t = rangeStart.getTime() - dayMs; t <= rangeEnd.getTime() + dayMs; t += dayMs) {
      const parts = this.getZonedDateParts(new Date(t), timezone);
      const key = `${parts.year}-${parts.month}-${parts.day}`;
      if (seenLocalDates.has(key)) continue;
      seenLocalDates.add(key);

      const dayRules = rulesByDow.get(parts.dayOfWeek);
      if (!dayRules) continue;

      for (const rule of dayRules) {
        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);

        const dayStart = this.zonedTimeToUtc(parts.year, parts.month, parts.day, startHour, startMinute, timezone);
        const dayEnd = this.zonedTimeToUtc(parts.year, parts.month, parts.day, endHour, endMinute, timezone);

        let cur = dayStart.getTime();
        const stepMs = durationMinutes * 60000;
        while (cur + stepMs <= dayEnd.getTime()) {
          const slotStart = new Date(cur);
          const slotEnd = new Date(cur + stepMs);
          if (
            slotStart.getTime() >= rangeStart.getTime() &&
            slotStart.getTime() <= rangeEnd.getTime() &&
            slotStart.getTime() > nowMs + 60000
          ) {
            slots.push({ startTime: slotStart, endTime: slotEnd });
          }
          cur += stepMs;
        }
      }
    }

    return slots;
  }

  private timesOverlap(start1: Date, end1: Date, start2: Date, end2: Date): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Get dates that have at least one available slot. Used by the calendar
   * to grey out unavailable days. Heuristic — counts DB bookings vs rule
   * capacity per day. Does NOT consult Google Calendar (that's a TODO),
   * so a fully-Google-blocked day may still appear available here and only
   * reveal as empty when the visitor selects it.
   */
  async getAvailableDays(options: AvailabilityOptions): Promise<string[]> {
    const { organizationId, startDate, endDate, durationMinutes } = options;
    const startTimeMs = Date.now();

    const orgConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });

    const duration = durationMinutes || orgConfig?.bookingDurationMinutes || config.DEFAULT_BOOKING_DURATION_MINUTES;

    const users = await db.query.bookingUsers.findMany({
      where: and(
        eq(bookingUsers.organizationId, organizationId),
        eq(bookingUsers.isActive, true)
      )
    });

    if (users.length === 0) return [];
    const userIds = users.map(u => u.id);
    const userMap = new Map(users.map(u => [u.id, u]));

    const allRules = await db.query.availabilityRules.findMany({
      where: and(
        inArray(availabilityRules.bookingUserId, userIds),
        eq(availabilityRules.isActive, true)
      )
    });

    if (allRules.length === 0) return [];

    const rulesByUser = new Map<string, typeof availabilityRules.$inferSelect[]>();
    for (const rule of allRules) {
      if (!rulesByUser.has(rule.bookingUserId)) rulesByUser.set(rule.bookingUserId, []);
      rulesByUser.get(rule.bookingUserId)!.push(rule);
    }

    const allBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.bookingUserId, userIds),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endTime, startDate),
        lt(bookings.startTime, endDate)
      )
    });

    // Pre-compute potential slot count per (user, dayOfWeek)
    const potentialSlotsByUserDow = new Map<string, Map<number, number>>();
    for (const [userId, rules] of rulesByUser) {
      const dowMap = new Map<number, number>();
      for (const rule of rules) {
        const [sh, sm] = rule.startTime.split(':').map(Number);
        const [eh, em] = rule.endTime.split(':').map(Number);
        const minutes = (eh * 60 + em) - (sh * 60 + sm);
        const slotsForRule = Math.floor(minutes / duration);
        dowMap.set(rule.dayOfWeek, (dowMap.get(rule.dayOfWeek) || 0) + slotsForRule);
      }
      potentialSlotsByUserDow.set(userId, dowMap);
    }

    // Bookings indexed by user + user-local date string (YYYY-MM-DD in user TZ).
    // Indexing in user TZ matches how candidate dates are emitted below.
    const bookingsByUserDate = new Map<string, Map<string, number>>();
    for (const booking of allBookings) {
      const user = userMap.get(booking.bookingUserId);
      const tz = user?.timezone || 'UTC';
      const parts = this.getZonedDateParts(booking.startTime, tz);
      const dateStr = this.formatLocalDate(parts);
      let userMapForDate = bookingsByUserDate.get(booking.bookingUserId);
      if (!userMapForDate) {
        userMapForDate = new Map();
        bookingsByUserDate.set(booking.bookingUserId, userMapForDate);
      }
      userMapForDate.set(dateStr, (userMapForDate.get(dateStr) || 0) + 1);
    }

    const daysWithAvailability = new Set<string>();
    const nowMs = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    // Walk per-user calendar days in each user's TZ, emit days where any user
    // has rule coverage and the heuristic suggests open capacity.
    for (const user of users) {
      const tz = user.timezone || 'UTC';
      const dowMap = potentialSlotsByUserDow.get(user.id);
      if (!dowMap || dowMap.size === 0) continue;
      const userBookings = bookingsByUserDate.get(user.id);
      const seen = new Set<string>();

      for (let t = startDate.getTime() - dayMs; t <= endDate.getTime() + dayMs; t += dayMs) {
        const parts = this.getZonedDateParts(new Date(t), tz);
        const dateStr = this.formatLocalDate(parts);
        if (seen.has(dateStr)) continue;
        seen.add(dateStr);

        const potential = dowMap.get(parts.dayOfWeek);
        if (!potential || potential === 0) continue;

        // Skip days entirely in the past.
        const dayEndUtc = this.zonedTimeToUtc(parts.year, parts.month, parts.day, 23, 59, tz);
        if (dayEndUtc.getTime() < nowMs) continue;
        if (dayEndUtc.getTime() < startDate.getTime() || this.zonedTimeToUtc(parts.year, parts.month, parts.day, 0, 0, tz).getTime() > endDate.getTime()) continue;

        const bookedCount = userBookings?.get(dateStr) || 0;
        if (bookedCount < potential) {
          daysWithAvailability.add(dateStr);
        }
      }
    }

    logger.debug('Available days calculated', {
      organizationId,
      userCount: users.length,
      ruleCount: allRules.length,
      bookingCount: allBookings.length,
      availableDays: daysWithAvailability.size,
      elapsedMs: Date.now() - startTimeMs
    });

    return Array.from(daysWithAvailability).sort();
  }

  /**
   * Check if a specific time slot is available for a user.
   * Used during booking creation to validate the slot is still available.
   */
  async isSlotAvailable(userId: string, startTime: Date, endTime: Date): Promise<boolean> {
    const conflictingBooking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.bookingUserId, userId),
        eq(bookings.status, 'confirmed'),
        lt(bookings.startTime, endTime),
        gt(bookings.endTime, startTime)
      )
    });

    if (conflictingBooking) {
      logger.warn('Slot unavailable, conflicts with existing booking', {
        userId,
        bookingId: conflictingBooking.id
      });
      return false;
    }

    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, userId)
    });
    if (!user || !user.googleCalendarId || !user.googleRefreshToken) {
      return true;
    }

    try {
      const events = await googleCalendarService.getCalendarEvents(userId, startTime, endTime);
      const busyTimes = this.eventsToBusyTimes(events, user.timezone || 'UTC');
      const calendarConflict = busyTimes.some(busy =>
        this.timesOverlap(startTime, endTime, busy.start, busy.end)
      );
      if (calendarConflict) {
        logger.warn('Slot unavailable, conflicts with Google Calendar event', { userId });
        return false;
      }
    } catch (error) {
      logger.error('Slot availability check failed to read Google Calendar; rejecting slot', {
        userId,
        message: error instanceof Error ? error.message : String(error)
      });
      return false;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Timezone helpers
  // Wall-clock <-> UTC math via Intl.DateTimeFormat. No external deps.
  // ---------------------------------------------------------------------------

  private getZonedDateParts(date: Date, tz: string): ZonedDateParts {
    if (!tz || tz === 'UTC') {
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        dayOfWeek: date.getUTCDay()
      };
    }
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const map: Record<string, string> = {};
    for (const part of fmt.formatToParts(date)) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    const weekdayToDow: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      year: Number(map.year),
      month: Number(map.month),
      day: Number(map.day),
      dayOfWeek: weekdayToDow[map.weekday] ?? 0
    };
  }

  private getTimezoneOffsetMs(date: Date, tz: string): number {
    if (!tz || tz === 'UTC') return 0;
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const map: Record<string, string> = {};
    for (const part of fmt.formatToParts(date)) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second)
    );
    return asUtc - date.getTime();
  }

  /**
   * Convert a wall-clock time in `tz` to a UTC Date. monthOneBased uses 1..12.
   * Two-pass to handle DST transitions correctly.
   */
  private zonedTimeToUtc(
    year: number,
    monthOneBased: number,
    day: number,
    hour: number,
    minute: number,
    tz: string
  ): Date {
    if (!tz || tz === 'UTC') {
      return new Date(Date.UTC(year, monthOneBased - 1, day, hour, minute));
    }
    const guess = Date.UTC(year, monthOneBased - 1, day, hour, minute);
    const offset1 = this.getTimezoneOffsetMs(new Date(guess), tz);
    const corrected = guess - offset1;
    const offset2 = this.getTimezoneOffsetMs(new Date(corrected), tz);
    return new Date(guess - offset2);
  }

  private formatLocalDate(parts: ZonedDateParts): string {
    const mm = String(parts.month).padStart(2, '0');
    const dd = String(parts.day).padStart(2, '0');
    return `${parts.year}-${mm}-${dd}`;
  }

  /**
   * Persist the outcome of a calendar fetch on bookingUsers so the admin UI
   * can show "calendar OK" / "calendar broken: <reason>" badges without
   * triggering its own Google API call.
   */
  private async recordCalendarHealth(userId: string, errorMessage: string | null): Promise<void> {
    await db
      .update(bookingUsers)
      .set({
        calendarLastError: errorMessage,
        calendarLastCheckedAt: new Date()
      })
      .where(eq(bookingUsers.id, userId));
  }
}

export const availabilityService = new AvailabilityService();
