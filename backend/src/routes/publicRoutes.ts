import { getLogger } from '../logger';
import { jsonResponse, errorResponse } from './router';
import { availabilityService } from '../services/AvailabilityService';
import { bookingService } from '../services/BookingService';
import { mailSendService } from '../services/MailSendService';
import { db } from '../db';
import { bookingConfigs, bookingUsers } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { CreateBookingRequest, AvailabilityRequest } from '../types';

const logger = getLogger('publicRoutes');

export async function handlePublicRoutes(request: Request, url: URL): Promise<Response> {
  const path = url.pathname;
  const method = request.method;

  try {
    // GET /api/public/availability
    if (path === '/api/public/availability' && method === 'GET') {
      return await handleGetAvailability(url);
    }

    // POST /api/public/bookings
    if (path === '/api/public/bookings' && method === 'POST') {
      return await handleCreateBooking(request);
    }

    // GET /api/public/config/:identifier (supports org ID or booking slug)
    const configMatch = path.match(/^\/api\/public\/config\/([^\/]+)$/);
    if (configMatch && method === 'GET') {
      return await handleGetConfig(configMatch[1]);
    }

    return errorResponse('Not found', 404);
  } catch (error: any) {
    logger.error('Public route error', { error: error.message, path });
    return errorResponse(error.message || 'Internal server error', 500);
  }
}

/**
 * GET /api/public/availability
 * Get available time slots across all users in an organization
 */
async function handleGetAvailability(url: URL): Promise<Response> {
  let orgIdentifier = url.searchParams.get('orgId');
  const startDate = url.searchParams.get('startDate');
  const endDate = url.searchParams.get('endDate');
  const durationMinutes = url.searchParams.get('durationMinutes');

  if (!orgIdentifier || !startDate || !endDate) {
    return errorResponse('Missing required parameters: orgId, startDate, endDate', 400);
  }

  try {
    // Resolve booking slug to organization ID if needed
    let orgId = orgIdentifier;
    const config = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.bookingSlug, orgIdentifier)
    });
    if (config) {
      orgId = config.organizationId;
    }

    const slots = await availabilityService.getAvailableSlots({
      organizationId: orgId,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      durationMinutes: durationMinutes ? parseInt(durationMinutes) : undefined
    });

    return jsonResponse({
      success: true,
      data: slots.map(slot => ({
        startTime: slot.startTime.toISOString(),
        endTime: slot.endTime.toISOString(),
        userId: slot.userId,
        userName: slot.userName,
        userEmail: slot.userEmail
      }))
    });
  } catch (error: any) {
    logger.error('Failed to get availability', { error, orgIdentifier });
    return errorResponse(error.message, 500);
  }
}

/**
 * POST /api/public/bookings
 * Create a new booking
 */
async function handleCreateBooking(request: Request): Promise<Response> {
  let body: CreateBookingRequest;

  try {
    body = await request.json();
  } catch (error) {
    return errorResponse('Invalid JSON body', 400);
  }

  // Validate required fields
  if (!body.userId || !body.startTime || !body.endTime) {
    return errorResponse('Missing required fields: userId, startTime, endTime', 400);
  }

  if (!body.visitorData || !body.visitorData.email) {
    return errorResponse('Visitor email is required', 400);
  }

  try {
    // Fetch the user to get the organization ID
    const user = await db.query.bookingUsers.findFirst({
      where: eq(bookingUsers.id, body.userId)
    });

    if (!user) {
      return errorResponse('User not found', 404);
    }

    // Create the booking
    const result = await bookingService.createBooking({
      userId: body.userId,
      organizationId: user.organizationId,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      visitorData: body.visitorData,
      notes: body.notes
    });

    // Fix organizationId (fetch from user)
    const updatedResult = await bookingService.updateBooking(result.booking.id, {
      visitorData: body.visitorData,
      notes: body.notes
    });

    // Send email notifications
    try {
      await Promise.all([
        mailSendService.sendVisitorConfirmation(updatedResult),
        mailSendService.sendUserNotification(updatedResult)
      ]);
    } catch (emailError) {
      logger.warn('Failed to send emails', { emailError });
      // Don't fail the booking if emails fail
    }

    return jsonResponse({
      success: true,
      data: {
        bookingId: updatedResult.booking.id,
        startTime: updatedResult.booking.startTime.toISOString(),
        endTime: updatedResult.booking.endTime.toISOString(),
        googleMeetLink: updatedResult.booking.googleMeetLink,
        status: updatedResult.booking.status
      }
    }, 201);
  } catch (error: any) {
    logger.error('Failed to create booking', { error });
    return errorResponse(error.message || 'Failed to create booking', 500);
  }
}

/**
 * GET /api/public/config/:identifier
 * Get booking configuration for an organization
 * @param identifier - Either organization ID or booking slug
 */
async function handleGetConfig(identifier: string): Promise<Response> {
  try {
    // Try to find by slug first, then by org ID
    let config = await db.query.bookingConfigs.findFirst({
      where: eq(bookingConfigs.bookingSlug, identifier)
    });

    if (!config) {
      config = await db.query.bookingConfigs.findFirst({
        where: eq(bookingConfigs.organizationId, identifier)
      });
    }

    if (!config) {
      // Return default config
      return jsonResponse({
        success: true,
        data: {
          organizationId: identifier,
          visitorFields: [
            { name: 'name', label: 'Full Name', type: 'text', required: true },
            { name: 'email', label: 'Email Address', type: 'email', required: true },
            { name: 'phone', label: 'Phone Number', type: 'tel', required: false }
          ],
          bookingDurationMinutes: 30,
          advanceBookingDays: 30
        }
      });
    }

    return jsonResponse({
      success: true,
      data: {
        visitorFields: config.visitorFields,
        bookingDurationMinutes: config.bookingDurationMinutes,
        advanceBookingDays: config.advanceBookingDays,
        widgetTheme: config.widgetTheme
      }
    });
  } catch (error: any) {
    logger.error('Failed to get config', { error, identifier });
    return errorResponse(error.message, 500);
  }
}
