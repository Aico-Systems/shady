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

export interface AvailabilityOptions {
  organizationId: string;
  startDate: Date;
  endDate: Date;
  durationMinutes?: number;
}

/**
 * Simple in-memory cache for Google Calendar events
 * Reduces API calls when multiple availability checks happen in quick succession
 */
interface CacheEntry {
  data: Array<{ start: Date; end: Date }>;
  expiresAt: number;
}

export class AvailabilityService {
  private googleCalendarCache = new Map<string, CacheEntry>();
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute cache

  constructor() {
    // Periodically clean up expired cache entries to prevent memory leak
    setInterval(() => {
      const now = Date.now();
      let cleanedCount = 0;
      
      for (const [key, entry] of this.googleCalendarCache.entries()) {
        if (entry.expiresAt <= now) {
          this.googleCalendarCache.delete(key);
          cleanedCount++;
        }
      }
      
      if (cleanedCount > 0) {
        logger.debug('Cleaned up expired cache entries', { 
          cleanedCount, 
          remainingCount: this.googleCalendarCache.size 
        });
      }
    }, 5 * 60 * 1000); // Clean every 5 minutes
  }
  /**
   * Get all available time slots across all users in an organization
   * 
   * HIGHLY OPTIMIZED for thousands of users:
   * - Single query for all users
   * - Single query for all availability rules
   * - Single query for all bookings
   * - Batch Google Calendar API calls (with caching)
   * - In-memory filtering using efficient data structures
   * 
   * Complexity: O(n) instead of O(n²) where n = users
   */
  async getAvailableSlots(options: AvailabilityOptions): Promise<TimeSlot[]> {
    const { organizationId, startDate, endDate, durationMinutes } = options;
    const startTime = Date.now();

    // Get booking duration from config
    const orgConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });

    const duration = durationMinutes || orgConfig?.bookingDurationMinutes || config.DEFAULT_BOOKING_DURATION_MINUTES;
    const bufferMinutes = orgConfig?.bufferMinutes || 0;

    // QUERY 1: Get all active booking users for the organization
    const users = await db.query.bookingUsers.findMany({
      where: and(
        eq(bookingUsers.organizationId, organizationId),
        eq(bookingUsers.isActive, true)
      )
    });

    if (users.length === 0) {
      logger.warn('No active booking users found', { organizationId });
      return [];
    }

    const userIds = users.map(u => u.id);
    const userMap = new Map(users.map(u => [u.id, u]));

    logger.debug('Calculating availability', {
      organizationId,
      userCount: users.length,
      duration,
      bufferMinutes,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() }
    });

    // QUERY 2: Get ALL availability rules for all users in ONE batch query
    const allRules = await db.query.availabilityRules.findMany({
      where: and(
        inArray(availabilityRules.bookingUserId, userIds),
        eq(availabilityRules.isActive, true)
      )
    });

    // Group rules by user
    const rulesByUser = new Map<string, typeof availabilityRules.$inferSelect[]>();
    for (const rule of allRules) {
      if (!rulesByUser.has(rule.bookingUserId)) {
        rulesByUser.set(rule.bookingUserId, []);
      }
      rulesByUser.get(rule.bookingUserId)!.push(rule);
    }

    // QUERY 3: Get ALL bookings for all users in ONE batch query
    const allBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.bookingUserId, userIds),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endTime, startDate),
        lt(bookings.startTime, endDate)
      )
    });

    // Group bookings by user
    const bookingsByUser = new Map<string, typeof bookings.$inferSelect[]>();
    for (const booking of allBookings) {
      if (!bookingsByUser.has(booking.bookingUserId)) {
        bookingsByUser.set(booking.bookingUserId, []);
      }
      bookingsByUser.get(booking.bookingUserId)!.push(booking);
    }

    // BATCH: Fetch Google Calendar busy times for ALL users with calendar integration
    // Using Google's freebusy API which is MUCH faster than fetching individual events
    const usersWithCalendar = users.filter(u => u.googleCalendarId && u.googleRefreshToken);
    const googleEventsByUser = await this.batchFetchGoogleCalendarBusyTimesOptimized(
      usersWithCalendar,
      startDate,
      endDate
    );

    // Generate slots for each user in parallel (in-memory operations only)
    const allSlotsPromises = users.map(async (user) => {
      try {
        const userRules = rulesByUser.get(user.id) || [];
        if (userRules.length === 0) {
          return [];
        }

        // Generate potential slots from rules
        const potentialSlots = this.generateSlotsFromRules(userRules, startDate, endDate, duration);

        if (potentialSlots.length === 0) {
          return [];
        }

        // Combine busy times from bookings and Google Calendar
        const userBookings = bookingsByUser.get(user.id) || [];
        const googleEvents = googleEventsByUser.get(user.id) || [];

        const busyTimes = [
          ...userBookings.map(b => ({ start: b.startTime, end: b.endTime })),
          ...googleEvents
        ];

        // Filter out slots that conflict with busy times (with buffer)
        const availableSlots = potentialSlots.filter(slot => {
          const slotStart = new Date(slot.startTime.getTime() - bufferMinutes * 60000);
          const slotEnd = new Date(slot.endTime.getTime() + bufferMinutes * 60000);
          
          return !busyTimes.some(busy => this.timesOverlap(slotStart, slotEnd, busy.start, busy.end));
        });

        // Add user info to slots
        return availableSlots.map(slot => ({
          ...slot,
          userId: user.id,
          userName: user.displayName,
          userEmail: user.email
        }));
      } catch (error) {
        logger.error('Failed to calculate availability for user', {
          userId: user.id,
          error
        });
        return [];
      }
    });

    const allSlots = await Promise.all(allSlotsPromises);

    // Flatten and sort all slots
    const flattenedSlots = allSlots.flat();
    flattenedSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const elapsed = Date.now() - startTime;
    logger.debug('Availability calculated', {
      organizationId,
      userCount: users.length,
      ruleCount: allRules.length,
      bookingCount: allBookings.length,
      googleCalendarUsers: usersWithCalendar.length,
      totalSlots: flattenedSlots.length,
      elapsedMs: elapsed
    });

    return flattenedSlots;
  }

  /**
   * Get a list of dates that have at least one available slot
   * This is optimized for calendar display to grey out unavailable days
   * 
   * @param options - Organization ID and date range
   * @returns Array of date strings (YYYY-MM-DD) that have availability
   */
  async getAvailableDates(options: AvailabilityOptions): Promise<string[]> {
    const slots = await this.getAvailableSlots(options);
    
    // Extract unique dates from all available slots
    const dateSet = new Set<string>();
    
    for (const slot of slots) {
      // Format date as YYYY-MM-DD in UTC
      const dateStr = slot.startTime.toISOString().split('T')[0];
      dateSet.add(dateStr);
    }
    
    // Convert to sorted array
    const dates = Array.from(dateSet).sort();
    
    logger.debug('Available dates calculated', {
      organizationId: options.organizationId,
      dateCount: dates.length,
      dateRange: { start: options.startDate.toISOString(), end: options.endDate.toISOString() }
    });
    
    return dates;
  }

  /**
   * Calculate available slots for a single user within a date range
   * 
   * This method:
   * 1. Fetches user's availability rules (e.g., Mon-Fri 9AM-5PM)
   * 2. Retrieves existing bookings and Google Calendar events
   * 3. Generates potential time slots from rules
   * 4. Filters out slots that conflict with busy times
   * 
   * @param userId - The booking user ID
   * @param startDate - Start of the date range (UTC)
   * @param endDate - End of the date range (UTC)
   * @param durationMinutes - Duration of each slot in minutes
   * @param bufferMinutes - Buffer time before/after bookings
   */
  private async calculateUserAvailability(
    userId: string,
    startDate: Date,
    endDate: Date,
    durationMinutes: number,
    bufferMinutes: number
  ): Promise<Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[]> {
    // Get user's availability rules
    const rules = await db.query.availabilityRules.findMany({
      where: and(
        eq(availabilityRules.bookingUserId, userId),
        eq(availabilityRules.isActive, true)
      )
    });

    if (rules.length === 0) {
      return [];
    }

    // Fetch existing bookings that overlap with the date range
    // Using proper overlap detection: booking.end > range.start AND booking.start < range.end
    const existingBookings = await db.query.bookings.findMany({
      where: and(
        eq(bookings.bookingUserId, userId),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endTime, startDate),
        lt(bookings.startTime, endDate)
      )
    });

    // Fetch Google Calendar events (busy times) - only timed events that block availability
    const googleEvents = await this.fetchGoogleCalendarBusyTimes(userId, startDate, endDate);

    // Combine all busy times from bookings and calendar events
    const busyTimes = [
      ...existingBookings.map(b => ({ start: b.startTime, end: b.endTime })),
      ...googleEvents
    ];

    // Generate potential slots based on availability rules
    const potentialSlots = this.generateSlotsFromRules(rules, startDate, endDate, durationMinutes);

    // Filter out slots that conflict with busy times (with buffer)
    const availableSlots = potentialSlots.filter(slot => {
      const slotStart = new Date(slot.startTime.getTime() - bufferMinutes * 60000);
      const slotEnd = new Date(slot.endTime.getTime() + bufferMinutes * 60000);
      
      return !busyTimes.some(busy => this.timesOverlap(slotStart, slotEnd, busy.start, busy.end));
    });

    return availableSlots;
  }

  /**
   * OPTIMIZED: Batch fetch Google Calendar busy times using freebusy API
   * This is Google's recommended way to check availability for multiple calendars
   * 
   * Benefits:
   * - Single API call per 50 users (vs 1 call per user)
   * - Only returns busy periods (no unnecessary event details)
   * - Much faster and uses less quota
   * - In-memory caching with TTL
   */
  private async batchFetchGoogleCalendarBusyTimesOptimized(
    users: Array<{ id: string; googleCalendarId: string | null; googleRefreshToken: string | null }>,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, Array<{ start: Date; end: Date }>>> {
    const result = new Map<string, Array<{ start: Date; end: Date }>>();
    
    if (users.length === 0) {
      return result;
    }

    const now = Date.now();
    const usersToFetch: typeof users = [];
    let cacheHits = 0;

    // Check cache first
    for (const user of users) {
      const cacheKey = `${user.id}:${startDate.toISOString()}:${endDate.toISOString()}`;
      const cached = this.googleCalendarCache.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        result.set(user.id, cached.data);
        cacheHits++;
      } else {
        if (cached) {
          this.googleCalendarCache.delete(cacheKey);
        }
        usersToFetch.push(user);
      }
    }

    if (usersToFetch.length === 0) {
      logger.debug('All Google Calendar busy times served from cache', { 
        userCount: users.length 
      });
      return result;
    }

    // Prepare user-calendar mapping for batch query
    const userCalendarMap = new Map<string, { calendarId: string; refreshToken: string }>();
    for (const user of usersToFetch) {
      if (user.googleCalendarId && user.googleRefreshToken) {
        userCalendarMap.set(user.id, {
          calendarId: user.googleCalendarId,
          refreshToken: user.googleRefreshToken
        });
      }
    }

    // Use Google's freebusy API to batch query
    const busyTimesByUser = await googleCalendarService.batchQueryFreeBusy(
      userCalendarMap,
      startDate,
      endDate
    );

    // Cache results and add to return map
    for (const [userId, busyTimes] of busyTimesByUser) {
      result.set(userId, busyTimes);

      // Cache the result
      const cacheKey = `${userId}:${startDate.toISOString()}:${endDate.toISOString()}`;
      this.googleCalendarCache.set(cacheKey, {
        data: busyTimes,
        expiresAt: now + this.CACHE_TTL_MS
      });
    }

    logger.debug('Batch fetched Google Calendar busy times (optimized)', {
      totalUsers: users.length,
      cacheHits,
      apiFetches: usersToFetch.length,
      successCount: result.size
    });

    return result;
  }

  /**
   * LEGACY: Batch fetch Google Calendar busy times for multiple users
   * This uses individual events.list calls per user
   * 
   * NOTE: This is kept for backward compatibility but should be avoided
   * Use batchFetchGoogleCalendarBusyTimesOptimized instead
   * 
   * Features:
   * - In-memory caching with TTL to reduce API calls
   * - Concurrency control to avoid rate limits
   * - Graceful error handling per user
   * - Filters out non-blocking events (all-day, cancelled, transparent)
   */
  private async batchFetchGoogleCalendarBusyTimes(
    users: Array<{ id: string; googleCalendarId: string | null }>,
    startDate: Date,
    endDate: Date
  ): Promise<Map<string, Array<{ start: Date; end: Date }>>> {
    const result = new Map<string, Array<{ start: Date; end: Date }>>();
    
    if (users.length === 0) {
      return result;
    }

    const now = Date.now();
    const usersToFetch: typeof users = [];
    let cacheHits = 0;

    // Check cache first
    for (const user of users) {
      const cacheKey = `${user.id}:${startDate.toISOString()}:${endDate.toISOString()}`;
      const cached = this.googleCalendarCache.get(cacheKey);

      if (cached && cached.expiresAt > now) {
        result.set(user.id, cached.data);
        cacheHits++;
      } else {
        // Clean up expired cache entry
        if (cached) {
          this.googleCalendarCache.delete(cacheKey);
        }
        usersToFetch.push(user);
      }
    }

    if (usersToFetch.length === 0) {
      logger.debug('All Google Calendar events served from cache', { 
        userCount: users.length 
      });
      return result;
    }

    // Batch fetch with concurrency control to avoid rate limits
    const CONCURRENT_REQUESTS = 10;
    const chunks: typeof usersToFetch[] = [];
    
    for (let i = 0; i < usersToFetch.length; i += CONCURRENT_REQUESTS) {
      chunks.push(usersToFetch.slice(i, i + CONCURRENT_REQUESTS));
    }

    for (const chunk of chunks) {
      const promises = chunk.map(async (user) => {
        try {
          const events = await googleCalendarService.getCalendarEvents(user.id, startDate, endDate);
          
          const busyTimes = events
            .filter(event => {
              // Only include timed events (not all-day)
              if (!event.start?.dateTime || !event.end?.dateTime) return false;
              // Skip cancelled events
              if (event.status === 'cancelled') return false;
              // Skip transparent/free-time events
              if (event.transparency === 'transparent') return false;
              return true;
            })
            .map(event => ({
              start: new Date(event.start!.dateTime!),
              end: new Date(event.end!.dateTime!)
            }));

          return { userId: user.id, busyTimes, error: null };
        } catch (error) {
          logger.warn('Failed to fetch Google Calendar events for user', { 
            userId: user.id, 
            error: error instanceof Error ? error.message : String(error)
          });
          return { userId: user.id, busyTimes: [], error };
        }
      });

      const results = await Promise.allSettled(promises);
      
      for (const promiseResult of results) {
        if (promiseResult.status === 'fulfilled') {
          const { userId, busyTimes, error } = promiseResult.value;
          result.set(userId, busyTimes);

          // Cache successful results
          if (!error) {
            const cacheKey = `${userId}:${startDate.toISOString()}:${endDate.toISOString()}`;
            this.googleCalendarCache.set(cacheKey, {
              data: busyTimes,
              expiresAt: now + this.CACHE_TTL_MS
            });
          }
        }
      }
    }

    logger.debug('Batch fetched Google Calendar events', {
      totalUsers: users.length,
      cacheHits,
      apiFetches: usersToFetch.length,
      successCount: result.size
    });

    return result;
  }

  /**
   * Fetch busy times from Google Calendar for a user
   * Filters out all-day events, cancelled events, and transparent (free-time) events
   * 
   * NOTE: This is kept for backward compatibility and single-user scenarios
   * For multiple users, use batchFetchGoogleCalendarBusyTimes instead
   */
  private async fetchGoogleCalendarBusyTimes(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ start: Date; end: Date }[]> {
    try {
      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, userId)
      });

      if (!user?.googleCalendarId) {
        return [];
      }

      const events = await googleCalendarService.getCalendarEvents(userId, startDate, endDate);
      
      return events
        .filter(event => {
          // Only include timed events (not all-day)
          if (!event.start?.dateTime || !event.end?.dateTime) return false;
          // Skip cancelled events
          if (event.status === 'cancelled') return false;
          // Skip transparent/free-time events
          if (event.transparency === 'transparent') return false;
          return true;
        })
        .map(event => ({
          start: new Date(event.start!.dateTime!),
          end: new Date(event.end!.dateTime!)
        }));
    } catch (error) {
      logger.warn('Failed to fetch Google Calendar events', { userId, error });
      return [];
    }
  }

  /**
   * Generate time slots based on availability rules
   */
  private generateSlotsFromRules(
    rules: typeof availabilityRules.$inferSelect[],
    startDate: Date,
    endDate: Date,
    durationMinutes: number
  ): Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] {
    const slots: Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] = [];

    // Group rules by day of week
    const rulesByDay = new Map<number, typeof availabilityRules.$inferSelect[]>();
    for (const rule of rules) {
      if (!rulesByDay.has(rule.dayOfWeek)) {
        rulesByDay.set(rule.dayOfWeek, []);
      }
      rulesByDay.get(rule.dayOfWeek)!.push(rule);
    }

    // Iterate through each day in the range
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getDay();
      const dayRules = rulesByDay.get(dayOfWeek);

      if (dayRules && dayRules.length > 0) {
        // Generate slots for each rule on this day
        for (const rule of dayRules) {
          const daySlots = this.generateSlotsForDay(
            currentDate,
            rule.startTime,
            rule.endTime,
            durationMinutes
          );
          slots.push(...daySlots);
        }
      }

      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return slots;
  }

  /**
   * Generate time slots for a specific day
   * All times are handled in UTC
   */
  private generateSlotsForDay(
    date: Date,
    startTime: string,
    endTime: string,
    durationMinutes: number
  ): Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] {
    const slots: Omit<TimeSlot, 'userId' | 'userName' | 'userEmail'>[] = [];

    // Parse start and end times (format: "HH:mm")
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);

    // Create start datetime in UTC
    const slotStart = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      startHour,
      startMinute,
      0,
      0
    ));

    // Create end datetime in UTC
    const dayEnd = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      endHour,
      endMinute,
      0,
      0
    ));

    const now = new Date();

    // Generate slots
    while (slotStart.getTime() + durationMinutes * 60000 <= dayEnd.getTime()) {
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60000);

      // Only include future slots (don't allow booking in the past)
      // Add a small buffer (1 minute) to avoid edge cases
      if (slotStart.getTime() > now.getTime() + 60000) {
        slots.push({
          startTime: new Date(slotStart),
          endTime: new Date(slotEnd)
        });
      }

      // Move to next slot (no gap between slots for now)
      slotStart.setTime(slotStart.getTime() + durationMinutes * 60000);
    }

    return slots;
  }

  /**
   * Check if two time ranges overlap
   * Returns true if there's any overlap between the two time ranges
   * 
   * Logic: Range1 overlaps Range2 if:
   * - Range1 starts before Range2 ends AND
   * - Range1 ends after Range2 starts
   */
  private timesOverlap(
    start1: Date,
    end1: Date,
    start2: Date,
    end2: Date
  ): boolean {
    return start1 < end2 && end1 > start2;
  }

  /**
   * Get dates that have at least one available slot
   * This is used by the calendar to grey out unavailable days
   * 
   * HIGHLY OPTIMIZED for thousands of users:
   * 1. Single query to get all users
   * 2. Single query to get all availability rules for those users
   * 3. Generate candidate dates based on days of week that have rules
   * 4. Single query to get all bookings for the date range
   * 5. Fast in-memory filtering using maps
   * 
   * Complexity: O(users + rules + bookings + days) instead of O(users * days * bookings)
   * 
   * @param options - Availability options
   * @returns Array of dates (as ISO strings YYYY-MM-DD) that have availability
   */
  async getAvailableDays(options: AvailabilityOptions): Promise<string[]> {
    const { organizationId, startDate, endDate, durationMinutes } = options;

    const startTime = Date.now();

    // Get booking duration from config
    const orgConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });

    const duration = durationMinutes || orgConfig?.bookingDurationMinutes || config.DEFAULT_BOOKING_DURATION_MINUTES;

    // QUERY 1: Get all active booking users for the organization
    const users = await db.query.bookingUsers.findMany({
      where: and(
        eq(bookingUsers.organizationId, organizationId),
        eq(bookingUsers.isActive, true)
      )
    });

    if (users.length === 0) {
      logger.debug('No active users found', { organizationId });
      return [];
    }

    const userIds = users.map(u => u.id);

    // QUERY 2: Get ALL availability rules for all users in ONE query
    const allRules = await db.query.availabilityRules.findMany({
      where: and(
        inArray(availabilityRules.bookingUserId, userIds),
        eq(availabilityRules.isActive, true)
      )
    });

    if (allRules.length === 0) {
      logger.debug('No availability rules found', { organizationId });
      return [];
    }

    // Group rules by user for fast lookup
    const rulesByUser = new Map<string, typeof availabilityRules.$inferSelect[]>();
    const availableDaysOfWeek = new Set<number>();
    
    for (const rule of allRules) {
      if (!rulesByUser.has(rule.bookingUserId)) {
        rulesByUser.set(rule.bookingUserId, []);
      }
      rulesByUser.get(rule.bookingUserId)!.push(rule);
      availableDaysOfWeek.add(rule.dayOfWeek);
    }

    // Generate candidate dates based on days of week that have rules
    const candidateDates: Array<{ dateStr: string; dayOfWeek: number }> = [];
    const currentDate = new Date(startDate);
    const now = new Date();

    while (currentDate <= endDate) {
      const dayOfWeek = currentDate.getUTCDay();
      
      // Only include dates that:
      // 1. Have rules for this day of week
      // 2. Are not in the past
      if (availableDaysOfWeek.has(dayOfWeek) && currentDate >= now) {
        const dateStr = currentDate.toISOString().split('T')[0];
        candidateDates.push({ dateStr, dayOfWeek });
      }

      currentDate.setUTCDate(currentDate.getUTCDate() + 1);
    }

    if (candidateDates.length === 0) {
      logger.debug('No candidate dates in range', { organizationId, startDate, endDate });
      return [];
    }

    // QUERY 3: Batch fetch ALL bookings for the entire range for all users in ONE query
    const allBookings = await db.query.bookings.findMany({
      where: and(
        inArray(bookings.bookingUserId, userIds),
        eq(bookings.status, 'confirmed'),
        gt(bookings.endTime, startDate),
        lt(bookings.startTime, endDate)
      )
    });

    // Group bookings by user and date for O(1) lookup
    const bookingsByUserDate = new Map<string, Map<string, typeof bookings.$inferSelect[]>>();
    for (const booking of allBookings) {
      const dateStr = booking.startTime.toISOString().split('T')[0];
      
      if (!bookingsByUserDate.has(booking.bookingUserId)) {
        bookingsByUserDate.set(booking.bookingUserId, new Map());
      }
      const userBookings = bookingsByUserDate.get(booking.bookingUserId)!;
      
      if (!userBookings.has(dateStr)) {
        userBookings.set(dateStr, []);
      }
      userBookings.get(dateStr)!.push(booking);
    }

    // Pre-calculate potential slots per user per day of week
    const potentialSlotsByUserDow = new Map<string, Map<number, number>>();
    for (const [userId, rules] of rulesByUser) {
      const dowMap = new Map<number, number>();
      
      for (const rule of rules) {
        const [startHour, startMinute] = rule.startTime.split(':').map(Number);
        const [endHour, endMinute] = rule.endTime.split(':').map(Number);
        
        const minutesAvailable = (endHour * 60 + endMinute) - (startHour * 60 + startMinute);
        const slotsForRule = Math.floor(minutesAvailable / duration);
        
        dowMap.set(rule.dayOfWeek, (dowMap.get(rule.dayOfWeek) || 0) + slotsForRule);
      }
      
      potentialSlotsByUserDow.set(userId, dowMap);
    }

    // Fast filtering: check each candidate date
    const daysWithAvailability = new Set<string>();

    for (const { dateStr, dayOfWeek } of candidateDates) {
      // Check if ANY user has availability on this date
      for (const userId of userIds) {
        const potentialSlots = potentialSlotsByUserDow.get(userId)?.get(dayOfWeek);
        if (!potentialSlots || potentialSlots === 0) continue;

        const userDateBookings = bookingsByUserDate.get(userId)?.get(dateStr) || [];
        
        // Simple heuristic: if bookings < potential slots, there's likely availability
        // This is conservative and may show some days that are actually fully booked
        // (when bookings perfectly fill all slots), but it's MUCH faster than
        // checking exact time ranges
        if (userDateBookings.length < potentialSlots) {
          daysWithAvailability.add(dateStr);
          break; // Found availability, move to next date
        }
      }
    }

    const elapsed = Date.now() - startTime;
    logger.debug('Available days calculated', {
      organizationId,
      userCount: users.length,
      ruleCount: allRules.length,
      bookingCount: allBookings.length,
      candidateDays: candidateDates.length,
      availableDays: daysWithAvailability.size,
      elapsedMs: elapsed
    });

    return Array.from(daysWithAvailability).sort();
  }

  /**
   * Check if a specific time slot is available for a user
   * Used during booking creation to validate the slot is still available
   * 
   * @param userId - The booking user ID
   * @param startTime - Slot start time (UTC)
   * @param endTime - Slot end time (UTC)
   * @returns true if the slot is available, false if conflicting
   */
  async isSlotAvailable(
    userId: string,
    startTime: Date,
    endTime: Date
  ): Promise<boolean> {
    // Check for conflicting bookings in database
    const conflictingBooking = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.bookingUserId, userId),
        eq(bookings.status, 'confirmed'),
        lt(bookings.startTime, endTime),
        gt(bookings.endTime, startTime)
      )
    });

    if (conflictingBooking) {
      logger.warn('Slot unavailable - conflicts with existing booking', {
        userId,
        bookingId: conflictingBooking.id,
        conflict: {
          existing: {
            start: conflictingBooking.startTime.toISOString(),
            end: conflictingBooking.endTime.toISOString()
          },
          requested: {
            start: startTime.toISOString(),
            end: endTime.toISOString()
          }
        }
      });
      return false;
    }

    // Check for conflicting Google Calendar events
    const googleBusyTimes = await this.fetchGoogleCalendarBusyTimes(userId, startTime, endTime);
    
    const calendarConflict = googleBusyTimes.some(busy => 
      this.timesOverlap(startTime, endTime, busy.start, busy.end)
    );

    if (calendarConflict) {
      logger.warn('Slot unavailable - conflicts with Google Calendar event', {
        userId,
        requested: {
          start: startTime.toISOString(),
          end: endTime.toISOString()
        }
      });
      return false;
    }

    return true;
  }
}

export const availabilityService = new AvailabilityService();
