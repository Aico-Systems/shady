import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { db } from '../db';
import { bookings, bookingUsers, bookingConfigs } from '../db/schema';
import { googleCalendarService } from './GoogleCalendarService';
import { availabilityService } from './AvailabilityService';
import { getLogger } from '../logger';

const logger = getLogger('BookingService');

export interface CreateBookingData {
  userId: string; // Booking user (who is being booked)
  organizationId: string;
  startTime: Date;
  endTime: Date;
  visitorData: {
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: any; // Additional custom fields
  };
  notes?: string;
}

export interface VisitorData {
  name?: string;
  email?: string;
  phone?: string;
  [key: string]: any;
}

export interface BookingWithUser {
  booking: Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData };
  user: typeof bookingUsers.$inferSelect;
}

export class BookingService {
  /**
   * Create a new booking
   * This includes:
   * 1. Validating availability
   * 2. Creating database record
   * 3. Creating Google Calendar event
   * 4. Sending email notifications (via MailSendService)
   */
  async createBooking(data: CreateBookingData): Promise<BookingWithUser> {
    const { userId, organizationId, startTime, endTime, visitorData, notes } = data;

    logger.info('Creating booking', { userId, organizationId, startTime, endTime });

    // 1. Validate that the time slot is available
    const isAvailable = await availabilityService.isSlotAvailable(userId, startTime, endTime);
    if (!isAvailable) {
      throw new Error('Time slot is not available');
    }

    // 2. Get user details
    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, userId)
    });

    if (!user) {
      throw new Error('Booking user not found');
    }

    if (!user.isActive) {
      throw new Error('User is not accepting bookings');
    }

    // 3. Create Google Calendar event
    let googleEventId: string | undefined;
    let googleMeetLink: string | undefined;

    try {
      if (user.googleCalendarId) {
        const calendarEvent = await googleCalendarService.createCalendarEvent(userId, {
          summary: `Booking with ${visitorData.name || 'Visitor'}`,
          description: `
Booking Details:
- Visitor: ${visitorData.name || 'N/A'}
- Email: ${visitorData.email || 'N/A'}
- Phone: ${visitorData.phone || 'N/A'}
${notes ? `\nNotes: ${notes}` : ''}
          `.trim(),
          startTime,
          endTime,
          attendees: visitorData.email ? [visitorData.email] : undefined,
          location: googleMeetLink
        });

        googleEventId = calendarEvent.eventId;
        googleMeetLink = calendarEvent.meetLink;

        logger.info('Google Calendar event created', { googleEventId, googleMeetLink });
      }
    } catch (error) {
      logger.error('Failed to create Google Calendar event', { error });
      // Continue with booking even if calendar event fails
      // The user can manually add it later
    }

    // 4. Create booking in database
    const [booking] = await db.insert(bookings).values({
      bookingUserId: userId,
      organizationId,
      startTime,
      endTime,
      visitorData,
      googleEventId,
      googleMeetLink,
      status: 'confirmed',
      notes
    }).returning();

    logger.info('Booking created successfully', { bookingId: booking.id });

    // 5. Send email notifications
    // Note: This will be implemented when MailSendService is ready
    // For now, we'll log it
    logger.info('Email notifications should be sent', {
      bookingId: booking.id,
      visitorEmail: visitorData.email,
      userEmail: user.email
    });

    return {
      booking: booking as Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData },
      user
    };
  }

  /**
   * Get a booking by ID
   */
  async getBooking(bookingId: string): Promise<BookingWithUser | null> {
    const booking = await db.query.bookings.findFirst({
      where: eq(bookings.id, bookingId)
    });

    if (!booking) {
      return null;
    }

    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, booking.bookingUserId)
    });

    if (!user) {
      return null;
    }

    return { 
      booking: booking as Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData }, 
      user 
    };
  }

  /**
   * Get all bookings for an organization
   */
  async getOrganizationBookings(
    organizationId: string,
    options?: {
      status?: string;
      userId?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
    }
  ): Promise<BookingWithUser[]> {
    const conditions = [eq(bookings.organizationId, organizationId)];

    if (options?.status) {
      conditions.push(eq(bookings.status, options.status));
    }

    if (options?.userId) {
      conditions.push(eq(bookings.bookingUserId, options.userId));
    }

    if (options?.startDate) {
      conditions.push(gte(bookings.startTime, options.startDate));
    }

    if (options?.endDate) {
      conditions.push(lte(bookings.endTime, options.endDate));
    }

    const bookingsList = await db.query.bookings.findMany({
      where: and(...conditions),
      orderBy: [desc(bookings.startTime)],
      limit: options?.limit,
      offset: options?.offset
    });

    // Fetch user details for each booking
    const bookingsWithUsers: BookingWithUser[] = [];
    for (const booking of bookingsList) {
      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, booking.bookingUserId)
      });

      if (user) {
        bookingsWithUsers.push({ 
          booking: booking as Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData }, 
          user 
        });
      }
    }

    return bookingsWithUsers;
  }

  /**
   * Get bookings for a specific user
   */
  async getUserBookings(
    userId: string,
    options?: {
      status?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
    }
  ): Promise<typeof bookings.$inferSelect[]> {
    const conditions = [eq(bookings.bookingUserId, userId)];

    if (options?.status) {
      conditions.push(eq(bookings.status, options.status));
    }

    if (options?.startDate) {
      conditions.push(gte(bookings.startTime, options.startDate));
    }

    if (options?.endDate) {
      conditions.push(lte(bookings.endTime, options.endDate));
    }

    return await db.query.bookings.findMany({
      where: and(...conditions),
      orderBy: [desc(bookings.startTime)],
      limit: options?.limit
    });
  }

  /**
   * Cancel a booking
   */
  async cancelBooking(
    bookingId: string,
    reason?: string
  ): Promise<BookingWithUser> {
    const existing = await this.getBooking(bookingId);
    if (!existing) {
      throw new Error('Booking not found');
    }

    const { booking, user } = existing;

    // Delete Google Calendar event if it exists
    if (booking.googleEventId && user.googleCalendarId) {
      try {
        await googleCalendarService.deleteCalendarEvent(user.id, booking.googleEventId);
        logger.info('Google Calendar event deleted', { googleEventId: booking.googleEventId });
      } catch (error) {
        logger.error('Failed to delete Google Calendar event', { error });
        // Continue with cancellation even if calendar deletion fails
      }
    }

    // Update booking status
    const [updatedBooking] = await db.update(bookings)
      .set({
        status: 'cancelled',
        cancellationReason: reason,
        updatedAt: new Date()
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    logger.info('Booking cancelled', { bookingId });

    // TODO: Send cancellation emails

    return {
      booking: updatedBooking as Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData },
      user
    };
  }

  /**
   * Update booking notes
   */
  async updateBooking(
    bookingId: string,
    updates: {
      notes?: string;
      visitorData?: Record<string, any>;
    }
  ): Promise<BookingWithUser> {
    const existing = await this.getBooking(bookingId);
    if (!existing) {
      throw new Error('Booking not found');
    }

    const [updatedBooking] = await db.update(bookings)
      .set({
        ...updates,
        updatedAt: new Date()
      })
      .where(eq(bookings.id, bookingId))
      .returning();

    logger.info('Booking updated', { bookingId });

    return {
      booking: updatedBooking as Omit<typeof bookings.$inferSelect, 'visitorData'> & { visitorData: VisitorData },
      user: existing.user
    };
  }

  /**
   * Get booking statistics for an organization
   */
  async getBookingStats(organizationId: string): Promise<{
    total: number;
    confirmed: number;
    cancelled: number;
    upcomingCount: number;
  }> {
    const now = new Date();

    const allBookings = await db.query.bookings.findMany({
      where: eq(bookings.organizationId, organizationId)
    });

    const confirmed = allBookings.filter(b => b.status === 'confirmed').length;
    const cancelled = allBookings.filter(b => b.status === 'cancelled').length;
    const upcomingCount = allBookings.filter(
      b => b.status === 'confirmed' && b.startTime > now
    ).length;

    return {
      total: allBookings.length,
      confirmed,
      cancelled,
      upcomingCount
    };
  }
}

export const bookingService = new BookingService();
