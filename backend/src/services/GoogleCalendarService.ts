import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config';
import { getLogger } from '../logger';
import { db } from '../db';
import { bookingUsers, calendarSyncState } from '../db/schema';
import { eq } from 'drizzle-orm';

const logger = getLogger('GoogleCalendarService');

export class GoogleCalendarService {
  private oauth2Client: OAuth2Client;

  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI
    );
  }

  /**
   * Generate OAuth URL for user to authorize Google Calendar access
   */
  generateAuthUrl(state?: string): string {
    const scopes = config.GOOGLE_SCOPES.split(',').map(s => s.trim());

    const authUrl = this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: scopes,
      state: state, // Pass through user/org context
      prompt: 'consent' // Force consent screen to get refresh token
    });

    logger.info('Generated OAuth URL', { scopes });
    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleOAuthCallback(code: string, bookingUserId: string): Promise<void> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.refresh_token) {
        throw new Error('No refresh token received. User may have already authorized.');
      }

      // Get user's calendar ID (primary calendar email)
      this.oauth2Client.setCredentials(tokens);
      const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

      const calendarListResponse = await calendar.calendarList.list();
      const primaryCalendar = calendarListResponse.data.items?.find(cal => cal.primary);

      if (!primaryCalendar || !primaryCalendar.id) {
        throw new Error('Could not find primary calendar');
      }

      // Store tokens in database
      await db.update(bookingUsers)
        .set({
          googleRefreshToken: tokens.refresh_token,
          googleAccessToken: tokens.access_token || null,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          googleCalendarId: primaryCalendar.id,
          updatedAt: new Date()
        })
        .where(eq(bookingUsers.id, bookingUserId));

      logger.info('Google Calendar connected successfully', {
        bookingUserId,
        calendarId: primaryCalendar.id
      });
    } catch (error) {
      logger.error('Failed to handle OAuth callback', { error, bookingUserId });
      throw error;
    }
  }

  /**
   * Get authenticated Calendar API client for a user
   */
  private async getCalendarClient(bookingUserId: string): Promise<calendar_v3.Calendar> {
    // Load user's tokens from database
    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, bookingUserId)
    });

    if (!user || !user.googleRefreshToken) {
      throw new Error('User has not connected Google Calendar');
    }

    // Set credentials
    this.oauth2Client.setCredentials({
      refresh_token: user.googleRefreshToken,
      access_token: user.googleAccessToken || undefined,
      expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined
    });

    // Auto-refresh if needed
    const calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });

    // Update tokens if they were refreshed
    const tokens = this.oauth2Client.credentials;
    if (tokens.access_token !== user.googleAccessToken) {
      await db.update(bookingUsers)
        .set({
          googleAccessToken: tokens.access_token || null,
          googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          updatedAt: new Date()
        })
        .where(eq(bookingUsers.id, bookingUserId));
    }

    return calendar;
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
        sendUpdates: 'all' // Send email to all attendees
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
        sendUpdates: 'all'
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
        sendUpdates: 'all' // Notify attendees
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

  /**
   * Batch query freebusy information for multiple calendars
   * This is MUCH more efficient than fetching events individually
   * 
   * Google Calendar API allows querying up to 50 calendars per request
   * This method handles batching and returns busy periods for each user
   * 
   * @param userCalendarMap - Map of booking user IDs to their calendar IDs
   * @param startTime - Start of the time range
   * @param endTime - End of the time range
   * @returns Map of booking user IDs to their busy time periods
   */
  async batchQueryFreeBusy(
    userCalendarMap: Map<string, { calendarId: string; refreshToken: string }>,
    startTime: Date,
    endTime: Date
  ): Promise<Map<string, Array<{ start: Date; end: Date }>>> {
    const result = new Map<string, Array<{ start: Date; end: Date }>>();

    if (userCalendarMap.size === 0) {
      return result;
    }

    // Google Calendar API supports up to 50 calendars per freebusy request
    const BATCH_SIZE = 50;
    const entries = Array.from(userCalendarMap.entries());
    const batches: typeof entries[] = [];

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      batches.push(entries.slice(i, i + BATCH_SIZE));
    }

    // Process each batch
    for (const batch of batches) {
      try {
        // Use the first user's credentials (they all have the same access scope)
        // This is safe because we're only querying, not modifying
        const firstUserId = batch[0][0];
        const calendar = await this.getCalendarClient(firstUserId);

        const items = batch.map(([_, data]) => ({ id: data.calendarId }));

        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin: startTime.toISOString(),
            timeMax: endTime.toISOString(),
            items
          }
        });

        // Parse results
        const calendars = response.data.calendars || {};
        
        for (const [bookingUserId, data] of batch) {
          const calendarData = calendars[data.calendarId];
          
          if (!calendarData) {
            result.set(bookingUserId, []);
            continue;
          }

          // Extract busy periods
          const busyPeriods = (calendarData.busy || [])
            .filter(period => period.start && period.end)
            .map(period => ({
              start: new Date(period.start!),
              end: new Date(period.end!)
            }));

          result.set(bookingUserId, busyPeriods);
        }

        logger.debug('Batch freebusy query successful', {
          batchSize: batch.length,
          calendarsQueried: items.length
        });
      } catch (error) {
        logger.error('Batch freebusy query failed', { 
          error,
          batchSize: batch.length 
        });

        // Fallback: set empty busy times for this batch
        for (const [bookingUserId] of batch) {
          result.set(bookingUserId, []);
        }
      }
    }

    logger.info('Batch freebusy query completed', {
      totalUsers: userCalendarMap.size,
      batches: batches.length,
      successCount: result.size
    });

    return result;
  }
}

export const googleCalendarService = new GoogleCalendarService();
