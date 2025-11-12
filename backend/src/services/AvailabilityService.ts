import { eq, and, lt, gt } from 'drizzle-orm';
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

export class AvailabilityService {
  /**
   * Get all available time slots across all users in an organization
   * This is the main "smart" aggregation function
   */
  async getAvailableSlots(options: AvailabilityOptions): Promise<TimeSlot[]> {
    const { organizationId, startDate, endDate, durationMinutes } = options;

    // Get booking duration from config
    const orgConfig = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.organizationId, organizationId)
    });

    const duration = durationMinutes || orgConfig?.bookingDurationMinutes || config.DEFAULT_BOOKING_DURATION_MINUTES;
    const bufferMinutes = orgConfig?.bufferMinutes || 0;

    // Get all active booking users for the organization
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

    logger.debug('Calculating availability', {
      organizationId,
      userCount: users.length,
      duration,
      dateRange: { start: startDate.toISOString(), end: endDate.toISOString() }
    });

    // Calculate slots for each user in parallel
    const allSlotsPromises = users.map(user =>
      this.calculateUserAvailability(user.id, startDate, endDate, duration, bufferMinutes)
        .then(slots => slots.map(slot => ({
          ...slot,
          userId: user.id,
          userName: user.displayName,
          userEmail: user.email
        })))
        .catch(error => {
          logger.error('Failed to calculate availability for user', {
            userId: user.id,
            error
          });
          return []; // Return empty array on error, don't fail entire request
        })
    );

    const allSlots = await Promise.all(allSlotsPromises);

    // Flatten and sort all slots
    const flattenedSlots = allSlots.flat();
    flattenedSlots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    logger.debug('Availability calculated', {
      organizationId,
      totalSlots: flattenedSlots.length
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
   * Fetch busy times from Google Calendar for a user
   * Filters out all-day events, cancelled events, and transparent (free-time) events
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
