import { createHmac, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { google } from 'googleapis';
import { config } from '../config';
import { db } from '../db';
import { bookingUsers } from '../db/schema';
import { getLogger } from '../logger';

const logger = getLogger('GoogleConnectionService');
const GOOGLE_STATE_TTL_MS = 10 * 60 * 1000;

export class GoogleConnectionService {
  private createOAuthClient(): InstanceType<typeof google.auth.OAuth2> {
    return new google.auth.OAuth2(
      config.GOOGLE_CLIENT_ID,
      config.GOOGLE_CLIENT_SECRET,
      config.GOOGLE_REDIRECT_URI
    );
  }

  getScopes(): string[] {
    return config.GOOGLE_SCOPES.split(',').map(scope => scope.trim()).filter(Boolean);
  }

  generateAuthUrl(bookingUserId: string): string {
    const state = this.createSignedState({ bookingUserId, issuedAt: Date.now() });
    const authUrl = this.createOAuthClient().generateAuthUrl({
      access_type: 'offline',
      scope: this.getScopes(),
      state,
      prompt: 'consent'
    });

    logger.info('Generated Google auth URL', { scopes: this.getScopes() });
    return authUrl;
  }

  parseAuthState(state: string): { bookingUserId: string } {
    const [encodedPayload, encodedSignature] = state.split('.');
    if (!encodedPayload || !encodedSignature) {
      throw new Error('Invalid Google OAuth state.');
    }

    const expectedSignature = this.sign(encodedPayload);
    const providedSignature = Buffer.from(encodedSignature, 'base64url');

    if (
      providedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(providedSignature, expectedSignature)
    ) {
      throw new Error('Invalid Google OAuth state signature.');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as {
      bookingUserId?: string;
      issuedAt?: number;
    };

    if (!payload.bookingUserId || !payload.issuedAt) {
      throw new Error('Incomplete Google OAuth state.');
    }

    if (Date.now() - payload.issuedAt > GOOGLE_STATE_TTL_MS) {
      throw new Error('Google OAuth state expired. Please reconnect.');
    }

    return { bookingUserId: payload.bookingUserId };
  }

  async handleOAuthCallback(code: string, bookingUserId: string): Promise<void> {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    logger.info('Google OAuth token exchange completed', {
      bookingUserId,
      grantedScopes: tokens.scope || null,
      hasRefreshToken: Boolean(tokens.refresh_token),
      hasAccessToken: Boolean(tokens.access_token)
    });

    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. Reconnect with consent to grant offline access.');
    }

    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarListResponse = await calendar.calendarList.list();
    const primaryCalendar = calendarListResponse.data.items?.find(cal => cal.primary);

    if (!primaryCalendar?.id) {
      throw new Error('Could not find primary calendar for connected Google account.');
    }

    await db.update(bookingUsers)
      .set({
        googleRefreshToken: tokens.refresh_token,
        googleAccessToken: tokens.access_token || null,
        googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        googleCalendarId: primaryCalendar.id,
        updatedAt: new Date()
      })
      .where(eq(bookingUsers.id, bookingUserId));

    logger.info('Google account connected successfully', {
      bookingUserId,
      calendarId: primaryCalendar.id
    });
  }

  async getAuthorizedClient(bookingUserId: string): Promise<{
    user: typeof bookingUsers.$inferSelect;
    auth: InstanceType<typeof google.auth.OAuth2>;
  }> {
    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, bookingUserId)
    });

    if (!user || !user.googleRefreshToken) {
      throw new Error('User has not connected Google.');
    }

    const auth = this.createOAuthClient();
    auth.setCredentials({
      refresh_token: user.googleRefreshToken,
      access_token: user.googleAccessToken || undefined,
      expiry_date: user.googleTokenExpiry ? user.googleTokenExpiry.getTime() : undefined
    });

    auth.on('tokens', async (tokens) => {
      try {
        await db.update(bookingUsers)
          .set({
            googleRefreshToken: tokens.refresh_token || user.googleRefreshToken,
            googleAccessToken: tokens.access_token || user.googleAccessToken,
            googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : user.googleTokenExpiry,
            updatedAt: new Date()
          })
          .where(eq(bookingUsers.id, bookingUserId));
      } catch (error) {
        logger.warn('Failed to persist refreshed Google tokens', { error, bookingUserId });
      }
    });

    return { user, auth };
  }

  private createSignedState(payload: { bookingUserId: string; issuedAt: number }): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${this.sign(encodedPayload).toString('base64url')}`;
  }

  private sign(value: string): Buffer {
    return createHmac('sha256', config.GOOGLE_CLIENT_SECRET).update(value).digest();
  }
}

export const googleConnectionService = new GoogleConnectionService();
