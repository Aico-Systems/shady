import { getLogger } from '../logger';
import { jsonResponse, errorResponse } from './router';
import { requireUserContext } from '../utils/logtoAuth';
import { db } from '../db';
import { bookingUsers, availabilityRules, bookingConfigs } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { googleCalendarService } from '../services/GoogleCalendarService';
import { bookingService } from '../services/BookingService';
import { config } from '../config';
import type { UpdateAvailabilityRequest, UpdateBookingConfigRequest } from '../types';
import { BOOKING_SCOPES, hasAnyScope } from '../utils/bookingScopes';
import { logtoManagementService } from '../services/logtoManagementService';
import { organizationSyncService } from '../services/organizationSyncService';

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
    await organizationSyncService.ensureOrganization(userContext.organizationId);

    // Users management — Logto is source of truth, local records are calendar connections
    if (path === '/api/admin/users' && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetUsers(userContext.organizationId);
    }

    if (path === '/api/admin/users' && method === 'POST') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.MANAGE_USERS]);
      if (denied) return denied;
      return await handleCreateUser(request, userContext.organizationId);
    }

    // User details
    const userMatch = path.match(/^\/api\/admin\/users\/([^\/]+)$/);
    if (userMatch && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetUser(userMatch[1], userContext.organizationId);
    }

    if (userMatch && method === 'PUT') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.MANAGE_USERS]);
      if (denied) return denied;
      return await handleUpdateUser(request, userMatch[1], userContext.organizationId);
    }

    // Google Calendar connection
    if (path.match(/^\/api\/admin\/users\/([^\/]+)\/google-connect$/) && method === 'POST') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.CONNECT_CALENDAR]);
      if (denied) return denied;
      const userId = path.match(/^\/api\/admin\/users\/([^\/]+)\/google-connect$/)![1];
      return await handleGoogleConnect(userId, userContext.organizationId);
    }

    // Availability management
    const availMatch = path.match(/^\/api\/admin\/users\/([^\/]+)\/availability$/);
    if (availMatch && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetAvailability(availMatch[1], userContext.organizationId);
    }

    if (availMatch && method === 'PUT') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.MANAGE_USERS]);
      if (denied) return denied;
      return await handleUpdateAvailability(request, availMatch[1], userContext.organizationId);
    }

    // Bookings management
    if (path === '/api/admin/bookings' && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetBookings(url, userContext.organizationId);
    }

    const cancelMatch = path.match(/^\/api\/admin\/bookings\/([^\/]+)\/cancel$/);
    if (cancelMatch && method === 'PUT') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.WRITE]);
      if (denied) return denied;
      return await handleCancelBooking(request, cancelMatch[1], userContext.organizationId);
    }

    // Booking stats
    if (path === '/api/admin/bookings/stats' && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetBookingStats(userContext.organizationId);
    }

    // Configuration
    if (path === '/api/admin/config' && method === 'GET') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.READ]);
      if (denied) return denied;
      return await handleGetConfig(userContext.organizationId);
    }

    if (path === '/api/admin/config' && method === 'PUT') {
      const denied = requireScopes(userContext, [BOOKING_SCOPES.MANAGE_CONFIG]);
      if (denied) return denied;
      return await handleUpdateConfig(request, userContext.organizationId);
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('Admin route error', { error: error.message, path });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}

function requireScopes(userContext: any, scopes: readonly string[]): Response | null {
  if (hasAnyScope(userContext, scopes)) {
    return null;
  }

  return errorResponse(`Missing required scope. Expected one of: ${scopes.join(', ')}`, 403);
}

// GET /api/admin/users — Logto org members merged with local calendar connections
async function handleGetUsers(orgId: string): Promise<Response> {
  // Source of truth: Logto org membership
  const logtoMembers = await logtoManagementService.listOrganizationUsers(orgId);

  // Local calendar connections for this org
  const localUsers = await db.query.bookingUsers.findMany({
    where: eq(bookingUsers.organizationId, orgId)
  });
  const localByEmail = new Map(localUsers.map(u => [u.email, u]));

  // Update stale display name caches as a side effect
  const displayNameUpdates: Array<{ id: string; displayName: string }> = [];

  const users = logtoMembers.map(member => {
    const email = member.user.primaryEmail || member.user.username || '';
    const logtoName = member.user.name || member.user.username || '';
    const local = localByEmail.get(email);

    if (local && logtoName && local.displayName !== logtoName) {
      displayNameUpdates.push({ id: local.id, displayName: logtoName });
    }

    return {
      email,
      displayName: logtoName,
      avatar: member.user.avatar || null,
      roles: member.organizationRoles?.map((r: any) => r.name) || [],
      // Local state (null if no calendar connection yet)
      localId: local?.id || null,
      isActive: local?.isActive ?? false,
      hasGoogleCalendar: !!local?.googleCalendarId,
      timezone: local?.timezone || 'UTC',
      createdAt: local?.createdAt || null,
    };
  });

  // Fire-and-forget cache updates
  if (displayNameUpdates.length > 0) {
    Promise.all(
      displayNameUpdates.map(u =>
        db.update(bookingUsers)
          .set({ displayName: u.displayName, updatedAt: new Date() })
          .where(eq(bookingUsers.id, u.id))
      )
    ).catch(err => logger.warn('Failed to update display name cache', { error: err }));
  }

  return jsonResponse({ success: true, data: users });
}

// POST /api/admin/users — create local calendar connection for an org member
async function handleCreateUser(request: Request, orgId: string): Promise<Response> {
  const body = await request.json();

  if (!body.email) {
    return errorResponse('Email is required', 400);
  }

  const [user] = await db.insert(bookingUsers).values({
    organizationId: orgId,
    email: body.email,
    displayName: body.displayName || '',
    timezone: body.timezone || 'UTC',
    isActive: body.isActive ?? true
  }).onConflictDoUpdate({
    target: [bookingUsers.organizationId, bookingUsers.email],
    set: {
      displayName: body.displayName || '',
      timezone: body.timezone || 'UTC',
      isActive: body.isActive ?? true,
      updatedAt: new Date()
    }
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
async function handleGoogleConnect(userId: string, orgId: string): Promise<Response> {
  const user = await requireBookingUserInOrganization(userId, orgId);
  if (!user) {
    return errorResponse('User not found', 404);
  }
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
async function handleGetAvailability(userId: string, orgId: string): Promise<Response> {
  const user = await requireBookingUserInOrganization(userId, orgId);
  if (!user) {
    return errorResponse('User not found', 404);
  }
  const rules = await db.query.availabilityRules.findMany({
    where: eq(availabilityRules.bookingUserId, userId)
  });

  return jsonResponse({ success: true, data: rules });
}

// PUT /api/admin/users/:id/availability
async function handleUpdateAvailability(request: Request, userId: string, orgId: string): Promise<Response> {
  const user = await requireBookingUserInOrganization(userId, orgId);
  if (!user) {
    return errorResponse('User not found', 404);
  }
  const body: UpdateAvailabilityRequest = await request.json();

  await db.delete(availabilityRules)
    .where(eq(availabilityRules.bookingUserId, userId));

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
async function handleCancelBooking(request: Request, bookingId: string, orgId: string): Promise<Response> {
  const body = await request.json();
  const reason = body.reason;

  const existing = await bookingService.getBooking(bookingId);
  if (!existing || existing.booking.organizationId !== orgId) {
    return errorResponse('Booking not found', 404);
  }

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
  await organizationSyncService.ensureOrganization(orgId);

  let cfg = await db.query.bookingConfigs.findFirst({
    where: eq(bookingConfigs.organizationId, orgId)
  });

  if (!cfg) {
    throw new Error(`Booking config missing after organization sync: ${orgId}`);
  }

  return jsonResponse({ success: true, data: cfg });
}

// PUT /api/admin/config
async function handleUpdateConfig(request: Request, orgId: string): Promise<Response> {
  const body: UpdateBookingConfigRequest = await request.json();
  await organizationSyncService.ensureOrganization(orgId);

  const [updated] = await db.update(bookingConfigs)
    .set({
      ...body,
      updatedAt: new Date()
    })
    .where(eq(bookingConfigs.organizationId, orgId))
    .returning();

  if (!updated) {
    throw new Error(`Booking config missing after organization sync: ${orgId}`);
  }

  return jsonResponse({ success: true, data: updated });
}

async function requireBookingUserInOrganization(userId: string, orgId: string) {
  return await db.query.bookingUsers.findFirst({
    where: and(
      eq(bookingUsers.id, userId),
      eq(bookingUsers.organizationId, orgId)
    )
  });
}
