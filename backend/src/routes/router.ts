import { validateLogtoToken, LogtoAuthError, attachUserContext } from '../utils/logtoAuth';
import { getLogger } from '../logger';
import { config } from '../config';
import { handlePublicRoutes } from './publicRoutes';
import { handleAdminRoutes } from './adminRoutes';

const logger = getLogger('router');

// CORS headers for all responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Organization-Id',
  'Content-Type': 'application/json'
};

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders
  });
}

function errorResponse(message: string, status: number = 500): Response {
  return jsonResponse({ success: false, error: message }, status);
}

export async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  logger.debug('Request received', {
    method: request.method,
    path,
    query: url.search
  });

  try {
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Health check
    if (path === '/health' || path === '/api/health') {
      return jsonResponse({
        success: true,
        data: {
          status: 'ok',
          service: 'booking-service',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Public routes (no authentication)
    if (path.startsWith('/api/public/')) {
      return await handlePublicRoutes(request, url);
    }

    // Admin routes (require Logto authentication)
    if (path.startsWith('/api/admin/')) {
      // Google OAuth callback doesn't have auth header (comes from Google redirect)
      if (path === '/api/admin/google/callback') {
        return await handleAdminRoutes(request, url);
      }

      const authHeader = request.headers.get('Authorization');

      try {
        const userContext = await validateLogtoToken(authHeader);
        attachUserContext(request, userContext);
        return await handleAdminRoutes(request, url);
      } catch (authError) {
        if (authError instanceof LogtoAuthError) {
          return errorResponse(authError.message, authError.status);
        }
        throw authError;
      }
    }

    // 404 for unknown routes
    return errorResponse('Route not found', 404);

  } catch (error: any) {
    logger.error('Unexpected error handling request', {
      error: error.message,
      stack: error.stack,
      path
    });

    return errorResponse(
      config.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
      500
    );
  }
}

// Re-export for convenience
export { jsonResponse, errorResponse };
