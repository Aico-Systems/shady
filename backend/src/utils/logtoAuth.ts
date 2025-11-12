import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from '../config';
import { getLogger } from '../logger';

const logger = getLogger('auth');

export class LogtoAuthError extends Error {
  public status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'LogtoAuthError';
    this.status = status;
  }
}

export interface LogtoUserContext {
  id: string; // Logto user ID
  organizationId?: string;
  scopes: string[];
  organizationScopes: string[];
  isOrganizationToken: boolean;
  isSuperAdmin: boolean;
  clientId?: string;
}

/**
 * Extract bearer token from Authorization header
 */
function getTokenFromHeader(authorization: string | null): string {
  if (!authorization) {
    throw new LogtoAuthError('Authorization header missing');
  }

  if (!authorization.startsWith('Bearer ')) {
    throw new LogtoAuthError('Authorization token type not supported');
  }

  return authorization.slice(7); // Remove 'Bearer ' prefix
}

/**
 * Extract organization ID from the token payload
 */
function extractOrganizationId(payload: any): string | null {
  // Direct organization_id claim
  if (payload.organization_id && typeof payload.organization_id === 'string') {
    return payload.organization_id;
  }

  // Audience-based extraction
  // Format: "urn:logto:organization:<organization_id>"
  const audience = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
  if (audience && typeof audience === 'string' && audience.startsWith('urn:logto:organization:')) {
    return audience.replace('urn:logto:organization:', '');
  }

  return null;
}

/**
 * Decode JWT payload without verification (for reading audience)
 */
function decodeJwtPayload(token: string): any {
  try {
    const [, payloadBase64] = token.split('.');
    if (!payloadBase64) {
      throw new Error('Invalid token format');
    }
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    return JSON.parse(payloadJson);
  } catch (error) {
    throw new LogtoAuthError('Failed to decode token payload');
  }
}

/**
 * Cache for super admin status checks
 */
const superAdminCache = new Map<string, { status: boolean; expiresAt: number }>();
const SUPER_ADMIN_CACHE_TTL = 60_000; // 60 seconds

/**
 * Check if user has super admin role via Logto Management API (with caching)
 */
async function checkSuperAdminRoleCached(userId: string): Promise<boolean> {
  // Check cache first
  const cached = superAdminCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.status;
  }

  // Cache miss - query Logto
  const status = await checkSuperAdminRole(userId);

  // Store in cache
  superAdminCache.set(userId, {
    status,
    expiresAt: Date.now() + SUPER_ADMIN_CACHE_TTL
  });

  // Clean up expired entries
  if (superAdminCache.size > 100) {
    const now = Date.now();
    for (const [key, value] of superAdminCache.entries()) {
      if (value.expiresAt <= now) {
        superAdminCache.delete(key);
      }
    }
  }

  return status;
}

/**
 * Check if user has super admin role by querying Logto Management API
 */
async function checkSuperAdminRole(userId: string): Promise<boolean> {
  try {
    const endpoint = config.LOGTO_ENDPOINT.replace(/\/$/, '');

    if (!config.LOGTO_MANAGEMENT_APP_ID || !config.LOGTO_MANAGEMENT_APP_SECRET) {
      logger.debug('Management credentials not configured, skipping super admin check');
      return false;
    }

    // Obtain a management API token.
    // Try multiple resource indicators (Logto deployments may require the management API resource
    // or the configured API resource). Try Basic auth first (preferred), then fall back to
    // client_id/client_secret in the request body. Collect errors for debugging.
    const resourceCandidates = [
      'https://default.logto.app/api',
      config.LOGTO_API_RESOURCE,
      `${endpoint}/api`
    ].filter(Boolean) as string[];

    let managementToken: string | null = null;
    const tokenErrors: string[] = [];

    for (const resource of resourceCandidates) {
      try {
        // Try with Basic auth header first (this is how the setup script requests tokens)
        const basicAuth = Buffer.from(`${config.LOGTO_MANAGEMENT_APP_ID}:${config.LOGTO_MANAGEMENT_APP_SECRET}`).toString('base64');
        let res = await fetch(`${endpoint}/oidc/token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${basicAuth}`
          },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            resource,
            scope: 'all'
          }).toString()
        });

        if (!res.ok) {
          // Fallback: try client_id/client_secret in body (some deployments accept this)
          const text = await res.text();
          tokenErrors.push(`${resource} (basic): ${res.status} ${text.slice(0, 200)}`);

          res = await fetch(`${endpoint}/oidc/token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: config.LOGTO_MANAGEMENT_APP_ID,
              client_secret: config.LOGTO_MANAGEMENT_APP_SECRET,
              resource,
              scope: 'all'
            }).toString()
          });
        }

        if (res.ok) {
          const data = await res.json();
          managementToken = data.access_token;
          logger.debug('Obtained management token', { resource });
          break;
        } else {
          const text = await res.text();
          tokenErrors.push(`${resource} (form): ${res.status} ${text.slice(0, 200)}`);
        }
      } catch (err: any) {
        tokenErrors.push(`${resource}: ${err.message}`);
      }
    }

    if (!managementToken) {
      logger.warn('Failed to get management token', { errors: tokenErrors });
      return false;
    }

    // Check user's roles
    const rolesResponse = await fetch(`${endpoint}/api/users/${userId}/roles`, {
      headers: {
        'Authorization': `Bearer ${managementToken}`
      }
    });

    if (!rolesResponse.ok) {
      logger.warn('Failed to fetch user roles');
      return false;
    }

    const roles = await rolesResponse.json();
    const rolesList = Array.isArray(roles) ? roles : (roles.data || []);

    // Check for super admin role
    const superAdminRoles = ['Super Admin', 'super_admin', 'admin', 'global_admin'];
    return rolesList.some((role: any) =>
      superAdminRoles.some(adminRole =>
        role.name?.toLowerCase().includes(adminRole.toLowerCase()) ||
        role.id?.toLowerCase().includes(adminRole.toLowerCase())
      )
    );
  } catch (error) {
    logger.error('Error checking super admin role', { error });
    return false;
  }
}

// Cache JWKS to avoid repeated fetches
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCacheTime = 0;
const JWKS_CACHE_TTL = 300_000; // 5 minutes

/**
 * Get or create JWKS set with caching
 */
function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const now = Date.now();

  if (jwksCache && (now - jwksCacheTime) < JWKS_CACHE_TTL) {
    return jwksCache;
  }

  if (!config.LOGTO_JWKS_URL) {
    throw new LogtoAuthError('Logto JWKS URL not configured');
  }

  jwksCache = createRemoteJWKSet(new URL(config.LOGTO_JWKS_URL), {
    cooldownDuration: 30_000,
    cacheMaxAge: 600_000,
  });
  jwksCacheTime = now;

  return jwksCache;
}

/**
 * Verify JWT token with Logto
 */
async function verifyJwt(token: string, audience: string | string[], tokenIssuer?: string): Promise<any> {
  if (!config.LOGTO_JWKS_URL || !config.LOGTO_ISSUER) {
    throw new LogtoAuthError('Logto configuration incomplete');
  }

  const issuer = tokenIssuer || config.LOGTO_ISSUER;
  const audStr = Array.isArray(audience) ? (audience[0] || '') : audience;
  const expectedAudience = audStr && audStr.startsWith('urn:logto:organization:')
    ? audStr
    : config.LOGTO_API_RESOURCE;

  try {
    const JWKS = getJwks();

    const { payload } = await jwtVerify(token, JWKS, {
      issuer,
      audience: expectedAudience,
    });

    logger.debug('JWT verification successful', {
      userId: payload.sub,
      audience: expectedAudience
    });

    return payload;
  } catch (error: any) {
    // If key not found, clear cache and retry once
    if (error.message && error.message.includes('no applicable key found')) {
      logger.warn('JWT key not found, clearing cache and retrying');
      jwksCache = null;
      jwksCacheTime = 0;

      try {
        const JWKS = getJwks();
        const { payload } = await jwtVerify(token, JWKS, {
          issuer,
          audience: expectedAudience,
        });
        logger.info('JWT verification succeeded on retry');
        return payload;
      } catch (retryError: any) {
        throw new LogtoAuthError(`Token verification failed: ${retryError.message}`);
      }
    }

    logger.error('JWT verification failed', { error: error.message });
    throw new LogtoAuthError(`Token verification failed: ${error.message}`);
  }
}

/**
 * Validate Logto token and extract user context
 * Main entry point for authentication
 */
export async function validateLogtoToken(
  authHeader: string | null
): Promise<LogtoUserContext> {
  const token = getTokenFromHeader(authHeader);
  const payload = decodeJwtPayload(token);

  const audience = payload.aud;
  const organizationId = extractOrganizationId(payload);

  // Verify the JWT
  const verifiedPayload = await verifyJwt(token, audience, payload.iss);

  // Extract scopes
  const scopes: string[] = typeof verifiedPayload.scope === 'string'
    ? verifiedPayload.scope.split(' ')
    : Array.isArray(verifiedPayload.scope)
      ? verifiedPayload.scope
      : [];

  // Extract organization scopes
  const organizationScopes: string[] = Array.isArray(verifiedPayload.organization_permissions)
    ? verifiedPayload.organization_permissions
    : [];

  // Check if user is super admin
  let isSuperAdmin = scopes.includes('super_admin') || scopes.includes('all:organizations');

  if (!isSuperAdmin) {
    const userId = verifiedPayload.sub as string;
    isSuperAdmin = await checkSuperAdminRoleCached(userId);
  }

  logger.info('Token validated', {
    userId: verifiedPayload.sub,
    organizationId,
    isSuperAdmin
  });

  return {
    id: verifiedPayload.sub as string,
    organizationId: organizationId || undefined,
    scopes,
    organizationScopes,
    isOrganizationToken: Boolean(organizationId),
    isSuperAdmin,
    clientId: verifiedPayload.client_id as string | undefined
  };
}

/**
 * Helper to get user context from request
 */
const kUserContext = Symbol.for('booking.userContext');

export function getUserContext(request: Request): LogtoUserContext | null {
  return (request as any)[kUserContext] || null;
}

export function requireUserContext(request: Request): LogtoUserContext {
  const ctx = getUserContext(request);
  if (!ctx) {
    throw new LogtoAuthError('Authentication required', 401);
  }
  return ctx;
}

export function attachUserContext(request: Request, context: LogtoUserContext): void {
  (request as any)[kUserContext] = context;
}
