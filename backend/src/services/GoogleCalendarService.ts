import { google, calendar_v3 } from 'googleapis';
import { getLogger } from '../logger';
import { db } from '../db';
import { bookingUsers, calendarSyncState } from '../db/schema';
import { eq } from 'drizzle-orm';
import { googleConnectionService } from './GoogleConnectionService';

const logger = getLogger('GoogleCalendarService');

export class GoogleCalendarService {
  /**
   * Generate OAuth URL for user to authorize Google Calendar access
   */
  generateAuthUrl(bookingUserId: string): string {
    return googleConnectionService.generateAuthUrl(bookingUserId);
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleOAuthCallback(code: string, bookingUserId: string): Promise<void> {
    try {
      await googleConnectionService.handleOAuthCallback(code, bookingUserId);
    } catch (error) {
      logger.error('Failed to handle OAuth callback', { error, bookingUserId });
      throw error;
    }
  }

  /**
   * Get authenticated Calendar API client for a user
   */
  private async getCalendarClient(bookingUserId: string): Promise<calendar_v3.Calendar> {
    const { auth } = await googleConnectionService.getAuthorizedClient(bookingUserId);
    return google.calendar({ version: 'v3', auth });
  }

  /**
   * Fetch calendar events for a user within a date range
   * Used to determine busy times
   */
  async getCalendarEvents(
    bookingUserId: string,
    startTime: Date,
    endTime: Date
  ): Promise<calendar_v3.Schema$Event[]> {
    try {
      const calendar = await this.getCalendarClient(bookingUserId);

      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, bookingUserId)
      });

      if (!user || !user.googleCalendarId) {
        throw new Error('User calendar ID not found');
      }

      const response = await calendar.events.list({
        calendarId: user.googleCalendarId,
        timeMin: startTime.toISOString(),
        timeMax: endTime.toISOString(),
        singleEvents: true, // Expand recurring events
        orderBy: 'startTime'
      });

      logger.debug('Fetched calendar events', {
        bookingUserId,
        eventCount: response.data.items?.length || 0
      });

      return response.data.items || [];
    } catch (error) {
      logger.error('Failed to fetch calendar events', { error, bookingUserId });
      throw error;
    }
  }

  /**
   * Create a calendar event for a booking
   */
  async createCalendarEvent(
    bookingUserId: string,
    eventData: {
      summary: string;
      description?: string;
      startTime: Date;
      endTime: Date;
      attendees?: string[]; // Email addresses
      location?: string;
    }
  ): Promise<{ eventId: string; meetLink?: string }> {
    try {
      const calendar = await this.getCalendarClient(bookingUserId);

      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, bookingUserId)
      });

      if (!user || !user.googleCalendarId) {
        throw new Error('User calendar ID not found');
      }

      const event: calendar_v3.Schema$Event = {
        summary: eventData.summary,
        description: eventData.description,
        location: eventData.location,
        start: {
          dateTime: eventData.startTime.toISOString(),
          timeZone: user.timezone || 'UTC'
        },
        end: {
          dateTime: eventData.endTime.toISOString(),
          timeZone: user.timezone || 'UTC'
        },
        attendees: eventData.attendees?.map(email => ({ email })),
        conferenceData: {
          createRequest: {
            requestId: `booking-${Date.now()}`, // Unique ID for Google Meet
            conferenceSolutionKey: {
              type: 'hangoutsMeet'
            }
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 day before
            { method: 'popup', minutes: 30 } // 30 minutes before
          ]
        }
      };

      const response = await calendar.events.insert({
        calendarId: user.googleCalendarId,
        conferenceDataVersion: 1, // Enable conference creation
        requestBody: event,
        sendUpdates: 'none' // Booking emails are handled by GoogleMailService
      });

      logger.info('Calendar event created', {
        bookingUserId,
        eventId: response.data.id
      });

      return {
        eventId: response.data.id!,
        meetLink: response.data.hangoutLink || undefined
      };
    } catch (error) {
      logger.error('Failed to create calendar event', { error, bookingUserId });
      throw error;
    }
  }

  /**
   * Update an existing calendar event
   */
  async updateCalendarEvent(
    bookingUserId: string,
    eventId: string,
    updates: {
      summary?: string;
      description?: string;
      startTime?: Date;
      endTime?: Date;
    }
  ): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(bookingUserId);

      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, bookingUserId)
      });

      if (!user || !user.googleCalendarId) {
        throw new Error('User calendar ID not found');
      }

      const event: calendar_v3.Schema$Event = {};

      if (updates.summary) event.summary = updates.summary;
      if (updates.description) event.description = updates.description;
      if (updates.startTime) {
        event.start = {
          dateTime: updates.startTime.toISOString(),
          timeZone: user.timezone || 'UTC'
        };
      }
      if (updates.endTime) {
        event.end = {
          dateTime: updates.endTime.toISOString(),
          timeZone: user.timezone || 'UTC'
        };
      }

      await calendar.events.patch({
        calendarId: user.googleCalendarId,
        eventId,
        requestBody: event,
        sendUpdates: 'none'
      });

      logger.info('Calendar event updated', { bookingUserId, eventId });
    } catch (error) {
      logger.error('Failed to update calendar event', { error, bookingUserId, eventId });
      throw error;
    }
  }

  /**
   * Delete a calendar event (for cancellations)
   */
  async deleteCalendarEvent(bookingUserId: string, eventId: string): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(bookingUserId);

      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, bookingUserId)
      });

      if (!user || !user.googleCalendarId) {
        throw new Error('User calendar ID not found');
      }

      await calendar.events.delete({
        calendarId: user.googleCalendarId,
        eventId,
        sendUpdates: 'none'
      });

      logger.info('Calendar event deleted', { bookingUserId, eventId });
    } catch (error) {
      logger.error('Failed to delete calendar event', { error, bookingUserId, eventId });
      throw error;
    }
  }

  /**
   * Perform incremental sync for a user's calendar
   * Uses sync tokens for efficiency
   */
  async syncCalendar(bookingUserId: string): Promise<void> {
    try {
      const calendar = await this.getCalendarClient(bookingUserId);

      const user = await db.query.bookingUsers.findFirst({
        where: eq(bookingUsers.id, bookingUserId)
      });

      if (!user || !user.googleCalendarId) {
        throw new Error('User calendar ID not found');
      }

      // Load sync state
      const syncState = await db.query.calendarSyncState.findFirst({
        where: eq(calendarSyncState.bookingUserId, bookingUserId)
      });

      const requestParams: calendar_v3.Params$Resource$Events$List = {
        calendarId: user.googleCalendarId,
        singleEvents: true
      };

      if (syncState?.syncToken) {
        // Incremental sync
        requestParams.syncToken = syncState.syncToken;
      } else {
        // Full sync - get events from now onwards
        requestParams.timeMin = new Date().toISOString();
      }

      const response = await calendar.events.list(requestParams);

      // Store new sync token
      const newSyncToken = response.data.nextSyncToken;
      if (newSyncToken) {
        if (syncState) {
          await db.update(calendarSyncState)
            .set({
              syncToken: newSyncToken,
              lastSyncedAt: new Date(),
              lastSyncStatus: 'success',
              lastSyncError: null,
              updatedAt: new Date()
            })
            .where(eq(calendarSyncState.bookingUserId, bookingUserId));
        } else {
          await db.insert(calendarSyncState).values({
            bookingUserId,
            syncToken: newSyncToken,
            lastSyncedAt: new Date(),
            lastSyncStatus: 'success'
          });
        }
      }

      logger.info('Calendar synced successfully', {
        bookingUserId,
        changedEvents: response.data.items?.length || 0
      });
    } catch (error: any) {
      logger.error('Failed to sync calendar', { error, bookingUserId });

      // Update sync state with error
      await db.update(calendarSyncState)
        .set({
          lastSyncStatus: 'error',
          lastSyncError: error.message,
          updatedAt: new Date()
        })
        .where(eq(calendarSyncState.bookingUserId, bookingUserId));

      throw error;
    }
  }

  /**
   * Disconnect Google Calendar for a user
   */
  async disconnectCalendar(bookingUserId: string): Promise<void> {
    await db.update(bookingUsers)
      .set({
        googleRefreshToken: null,
        googleAccessToken: null,
        googleTokenExpiry: null,
        googleCalendarId: null,
        updatedAt: new Date()
      })
      .where(eq(bookingUsers.id, bookingUserId));

    // Delete sync state
    await db.delete(calendarSyncState)
      .where(eq(calendarSyncState.bookingUserId, bookingUserId));

    logger.info('Google Calendar disconnected', { bookingUserId });
  }
}

export const googleCalendarService = new GoogleCalendarService();
