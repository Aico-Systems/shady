import { getLogger } from '../logger';
import { jsonResponse, errorResponse } from './router';
import { requireUserContext } from '../utils/logtoAuth';
import { db } from '../db';
import { bookingUsers, availabilityRules, bookingConfigs, bookings } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { googleCalendarService } from '../services/GoogleCalendarService';
import { bookingService } from '../services/BookingService';
import { config } from '../config';
import type { UpdateAvailabilityRequest, UpdateBookingConfigRequest } from '../types';

const logger = getLogger('adminRoutes');

export async function handleAdminRoutes(request: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  // Google OAuth callback - doesn't need auth (comes from Google redirect)
  if (path === '/api/admin/google/callback' && method === 'GET') {
    return await handleGoogleCallback(url);
  }

  const userContext = requireUserContext(request);

  if (!userContext.organizationId) {
    return errorResponse('Organization context required', 403);
  }

  try {
    // Sync current user - auto-create booking user from Logto user
    if (path === '/api/admin/users/sync' && method === 'POST') {
      return await handleSyncCurrentUser(userContext);
    }

    // Users management
    if (path === '/api/admin/users' && method === 'GET') {
      return await handleGetUsers(userContext.organizationId);
    }

    if (path === '/api/admin/users' && method === 'POST') {
      return await handleCreateUser(request, userContext.organizationId, userContext.id);
    }

    // User details
    const userMatch = path.match(/^\/api\/admin\/users\/([^\/]+)$/);
    if (userMatch && method === 'GET') {
      return await handleGetUser(userMatch[1], userContext.organizationId);
    }

    if (userMatch && method === 'PUT') {
      return await handleUpdateUser(request, userMatch[1], userContext.organizationId);
    }

    // Google Calendar connection
    if (path.match(/^\/api\/admin\/users\/([^\/]+)\/google-connect$/) && method === 'POST') {
      const userId = path.match(/^\/api\/admin\/users\/([^\/]+)\/google-connect$/)![1];
      return await handleGoogleConnect(userId);
    }

    // Availability management
    const availMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/availability$/);
    if (availMatch && method === 'GET') {
      return await handleGetAvailability(availMatch[1]);
    }

    if (availMatch && method === 'PUT') {
      return await handleUpdateAvailability(request, availMatch[1]);
    }

    // Bookings management
    if (path === '/api/admin/bookings' && method === 'GET') {
      return await handleGetBookings(url, userContext.organizationId);
    }

    const cancelMatch = path.match(/^\/api\/admin\/bookings\/([^\/]+)\/cancel$/);
    if (cancelMatch && method === 'PUT') {
      return await handleCancelBooking(request, cancelMatch[1]);
    }

    // Booking stats
    if (path === '/api/admin/bookings/stats' && method === 'GET') {
      return await handleGetBookingStats(userContext.organizationId);
    }

    // Configuration
    if (path === '/api/admin/config' && method === 'GET') {
      return await handleGetConfig(userContext.organizationId);
    }

    if (path === '/api/admin/config' && method === 'PUT') {
      return await handleUpdateConfig(request, userContext.organizationId);
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('Admin route error', { error: error.message, path });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}

// POST /api/admin/users/sync - Sync current Logto user to booking database
async function handleSyncCurrentUser(userContext: any): Promise<Response> {
  const logtoUserId = userContext.id;
  const orgId = userContext.organizationId;

  if (!logtoUserId || !orgId) {
    return errorResponse('User ID and organization required', 400);
  }

  // Check if user already exists
  const existing = await db.query.bookingUsers.findFirst({
    where: eq(bookingUsers.logtoUserId, logtoUserId)
  });

  if (existing) {
    logger.info('User already synced', { logtoUserId, bookingUserId: existing.id });
    return jsonResponse({ 
      success: true, 
      data: { 
        ...existing, 
        alreadyExists: true 
      } 
    });
  }

  // Get user info from Logto Management API
  try {
    const managementToken = await getLogtoManagementToken();
    const userInfoResponse = await fetch(`${config.LOGTO_ENDPOINT}/api/users/${logtoUserId}`, {
      headers: { Authorization: `Bearer ${managementToken}` }
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Logto');
    }

    const userInfo = await userInfoResponse.json();

    // Create booking user
    const [bookingUser] = await db.insert(bookingUsers).values({
      organizationId: orgId,
      logtoUserId: logtoUserId,
      email: userInfo.primaryEmail || userInfo.username || `user-${logtoUserId}@unknown.local`,
      displayName: userInfo.name || userInfo.username || 'User',
      timezone: 'UTC',
      isActive: true
    }).returning();

    logger.info('User synced successfully', { 
      logtoUserId, 
      bookingUserId: bookingUser.id,
      email: bookingUser.email 
    });

    return jsonResponse({ success: true, data: bookingUser }, 201);
  } catch (error: any) {
    logger.error('Failed to sync user', { error: error.message, logtoUserId });
    return errorResponse(`Failed to sync user: ${error.message}`, 500);
  }
}

async function getLogtoManagementToken(): Promise<string> {
  const response = await fetch(`${config.LOGTO_ENDPOINT}/oidc/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      resource: 'https://default.logto.app/api',
      scope: 'all',
      client_id: config.LOGTO_MANAGEMENT_APP_ID!,
      client_secret: config.LOGTO_MANAGEMENT_APP_SECRET!
    })
  });

  const data = await response.json();
  return data.access_token;
}

// GET /api/admin/users
async function handleGetUsers(orgId: string): Promise<Response> {
  const users = await db.query.bookingUsers.findMany({
    where: eq(bookingUsers.organizationId, orgId)
  });

  return jsonResponse({
    success: true,
    data: users.map(u => ({
      id: u.id,
      logtoUserId: u.logtoUserId,
      email: u.email,
      displayName: u.displayName,
      isActive: u.isActive,
      hasGoogleCalendar: !!u.googleCalendarId,
      timezone: u.timezone,
      createdAt: u.createdAt
    }))
  });
}

// POST /api/admin/users
async function handleCreateUser(request: Request, orgId: string, logtoUserId: string): Promise<Response> {
  const body = await request.json();

  const [user] = await db.insert(bookingUsers).values({
    organizationId: orgId,
    logtoUserId: body.logtoUserId || logtoUserId,
    email: body.email,
    displayName: body.displayName,
    timezone: body.timezone || 'UTC',
    isActive: body.isActive ?? true
  }).returning();

  return jsonResponse({ success: true, data: user }, 201);
}

// GET /api/admin/users/:id
async function handleGetUser(userId: string, orgId: string): Promise<Response> {
  const user = await db.query.bookingUsers.findFirst({
    where: and(
      eq(bookingUsers.id, userId),
      eq(bookingUsers.organizationId, orgId)
    )
  });

  if (!user) {
    return errorResponse('User not found', 404);
  }

  return jsonResponse({ success: true, data: user });
}

// PUT /api/admin/users/:id
async function handleUpdateUser(request: Request, userId: string, orgId: string): Promise<Response> {
  const body = await request.json();

  const [updated] = await db.update(bookingUsers)
    .set({
      displayName: body.displayName,
      email: body.email,
      timezone: body.timezone,
      isActive: body.isActive,
      updatedAt: new Date()
    })
    .where(and(
      eq(bookingUsers.id, userId),
      eq(bookingUsers.organizationId, orgId)
    ))
    .returning();

  if (!updated) {
    return errorResponse('User not found', 404);
  }

  return jsonResponse({ success: true, data: updated });
}

// POST /api/admin/users/:id/google-connect
async function handleGoogleConnect(userId: string): Promise<Response> {
  const authUrl = googleCalendarService.generateAuthUrl(userId);
  return jsonResponse({ success: true, data: { authUrl } });
}

// GET /api/admin/google/callback
async function handleGoogleCallback(url: URL): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // userId

  if (!code || !state) {
    return errorResponse('Missing code or state', 400);
  }

  try {
    await googleCalendarService.handleOAuthCallback(code, state);
    // Redirect to admin UI success page
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${process.env.ADMIN_URL || 'http://localhost:5175'}/users?google-connected=true`
      }
    });
  } catch (error: any) {
    logger.error('Google OAuth callback failed', { error });
    return errorResponse(error.message, 500);
  }
}

// GET /api/admin/users/:id/availability
async function handleGetAvailability(userId: string): Promise<Response> {
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.bookingUserId, userId)
  });

  return jsonResponse({ success: true, data: rules });
}

// PUT /api/admin/users/:id/availability
async function handleUpdateAvailability(request: Request, userId: string): Promise<Response> {
  const body: UpdateAvailabilityRequest = await request.json();

  // Delete existing rules
  await db.delete(availabilityRules)
    .where(eq(availabilityRules.bookingUserId, userId));

  // Insert new rules
  if (body.rules && body.rules.length > 0) {
    await db.insert(availabilityRules).values(
      body.rules.map(rule => ({
        bookingUserId: userId,
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        isActive: rule.isActive
      }))
    );
  }

  const newRules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.bookingUserId, userId)
  });

  return jsonResponse({ success: true, data: newRules });
}

// GET /api/admin/bookings
async function handleGetBookings(url: URL, orgId: string): Promise<Response> {
  const userId = url.searchParams.get('userId');
  const status = url.searchParams.get('status');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');

  const bookingsList = await bookingService.getOrganizationBookings(orgId, {
    userId: userId || undefined,
    status: status || undefined,
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined
  });

  return jsonResponse({
    success: true,
    data: bookingsList.map(b => ({
      ...b.booking,
      user: {
        id: b.user.id,
        displayName: b.user.displayName,
        email: b.user.email
      }
    }))
  });
}

// PUT /api/admin/bookings/:id/cancel
async function handleCancelBooking(request: Request, bookingId: string): Promise<Response> {
  const body = await request.json();
  const reason = body.reason;

  const result = await bookingService.cancelBooking(bookingId, reason);

  return jsonResponse({ success: true, data: result.booking });
}

// GET /api/admin/bookings/stats
async function handleGetBookingStats(orgId: string): Promise<Response> {
  const stats = await bookingService.getBookingStats(orgId);
  return jsonResponse({ success: true, data: stats });
}

// GET /api/admin/config
async function handleGetConfig(orgId: string): Promise<Response> {
  let config = await db.query.bookingConfigs.findFirst({
    where: eq(bookingConfigs.organizationId, orgId)
  });

  if (!config) {
    // Create default config with auto-generated slug
    // Use first 8 chars of org ID as default slug (can be customized later)
    const defaultSlug = `org-${orgId.substring(0, 8)}`;
    
    [config] = await db.insert(bookingConfigs).values({
      organizationId: orgId,
      bookingSlug: defaultSlug
    }).returning();
  }

  return jsonResponse({ success: true, data: config });
}

// PUT /api/admin/config
async function handleUpdateConfig(request: Request, orgId: string): Promise<Response> {
  const body: UpdateBookingConfigRequest = await request.json();

  const [updated] = await db.update(bookingConfigs)
    .set({
      ...body,
      updatedAt: new Date()
    })
    .where(eq(bookingConfigs.organizationId, orgId))
    .returning();

  if (!updated) {
    // Create if doesn't exist
    const defaultSlug = body.bookingSlug || `org-${orgId.substring(0, 8)}`;
    const [created] = await db.insert(bookingConfigs).values({
      organizationId: orgId,
      bookingSlug: defaultSlug,
      ...body
    }).returning();
    return jsonResponse({ success: true, data: created });
  }

  return jsonResponse({ success: true, data: updated });
}
