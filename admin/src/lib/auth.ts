import { writable, derived, type Writable, get } from 'svelte/store';
import LogtoClient, { UserScope, ReservedResource, type Prompt } from '@logto/browser';

// Type definitions
export interface Organization {
  id: string;
  name: string;
  description?: string | null;
}

export interface User {
  sub: string;
  name?: string;
  email?: string;
  [key: string]: any;
}

// Store definitions
export const isAuthenticated: Writable<boolean> = writable(false);
export const user: Writable<User | null> = writable(null);
export const currentOrganization: Writable<Organization | null> = writable(null);
export const userOrganizations: Writable<Organization[]> = writable([]);
export const userScopes: Writable<string[]> = writable([]);
export const authReady: Writable<boolean> = writable(false);

// Permission helpers
export function hasScope(scope: string): boolean {
  const scopes = get(userScopes);
  return scopes.includes(scope);
}

export function hasAnyScope(requiredScopes: string[]): boolean {
  const scopes = get(userScopes);
  return requiredScopes.some(scope => scopes.includes(scope));
}

export function hasAllScopes(requiredScopes: string[]): boolean {
  const scopes = get(userScopes);
  return requiredScopes.every(scope => scopes.includes(scope));
}

// Booking-specific permission helpers
export const canManageBookings = derived(userScopes, $userScopes =>
  $userScopes.includes('bookings:write') || $userScopes.includes('bookings:delete')
);

export const canManageUsers = derived(userScopes, $userScopes =>
  $userScopes.includes('users:write')
);

export const canManageAvailability = derived(userScopes, $userScopes =>
  $userScopes.includes('users:availability')
);

export const canConnectCalendar = derived(userScopes, $userScopes =>
  $userScopes.includes('calendar:connect')
);

export const canManageConfig = derived(userScopes, $userScopes =>
  $userScopes.includes('config:write')
);

// Logto client configuration
const getLogtoConfig = () => {
  const endpoint = import.meta.env.VITE_LOGTO_ENDPOINT || 'http://localhost:3001';
  const appId = import.meta.env.VITE_LOGTO_APP_ID;
  const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'https://api.booking-service.local';

  if (!appId) {
    console.error('❌ VITE_LOGTO_APP_ID not configured in .env');
    console.error('   Run: make logto-setup to configure Logto');
  }

  console.log('🔐 Booking Admin - Logto config:', {
    endpoint,
    appId: appId ? `${appId.slice(0, 8)}...` : 'NOT SET',
    apiResource,
    redirectUri: `${window.location.origin}/callback`
  });

  return {
    endpoint,
    appId: appId || '',
    resources: [
      apiResource,
      ReservedResource.Organization
    ],
    scopes: [
      UserScope.Organizations,
      UserScope.Profile,
      UserScope.Email,
      // Booking service scopes
      'bookings:read',
      'bookings:write',
      'bookings:cancel',
      'bookings:stats',
      'users:read',
      'users:write',
      'users:availability',
      'calendar:connect',
      'calendar:sync',
      'config:read',
      'config:write'
    ],
    prompt: 'consent' as Prompt
  };
};

// Initialize Logto client
const logtoConfig = getLogtoConfig();
export const logtoClient = new LogtoClient(logtoConfig);

// Global fetch interceptor for automatic token injection
const originalFetch = window.fetch;
window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

  // Only inject token for API calls to our backend
  if (url.startsWith('/api') || url.includes('localhost:5006')) {
    const authenticated = get(isAuthenticated);
    if (authenticated) {
      const org = get(currentOrganization);
      if (!org) {
        console.warn('⚠️  No organization selected');
        return originalFetch(input, init);
      }

      try {
        const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'https://api.booking-service.local';
        const token = await logtoClient.getAccessToken(apiResource, org.id);

        init = init || {};
        init.headers = {
          ...init.headers,
          Authorization: `Bearer ${token}`,
          'X-Organization-Id': org.id
        };
      } catch (error) {
        console.error('Failed to get access token:', error);
      }
    }
  }

  return originalFetch(input, init);
};

// Auth state management
export async function initAuth() {
  console.log('🔄 Initializing authentication...');

  // Handle callback
  if (window.location.pathname === '/callback') {
    console.log('📥 Handling callback...');
    try {
      await logtoClient.handleSignInCallback(window.location.href);
      window.history.replaceState({}, '', '/');
    } catch (error) {
      console.error('Callback error:', error);
    }
  }

  // Check if authenticated
  const authenticated = await logtoClient.isAuthenticated();
  isAuthenticated.set(authenticated);

  if (authenticated) {
    console.log('✅ User is authenticated');

    // Get user info
    const claims = await logtoClient.getIdTokenClaims();
    user.set(claims as User);

    // Get organizations from ID token claims
    try {
      const orgsData = (claims as any)?.organizations;
      
      // Organizations is an array of organization IDs (strings), not objects
      let organizationIds: string[] = [];
      
      if (Array.isArray(orgsData)) {
        organizationIds = orgsData;
      }
      
      // Convert to Organization objects
      const organizations: Organization[] = organizationIds.map(id => ({
        id: id,
        name: id, // Use ID as name for now
        description: null
      }));
      
      userOrganizations.set(organizations);

      // Select first organization if available
      if (organizationIds.length > 0) {
        await switchOrganization(organizationIds[0]);
      } else {
        console.warn('⚠️  User has no organizations');
      }
    } catch (error) {
      console.error('Failed to get organizations:', error);
      userOrganizations.set([]);
    }
  } else {
    console.log('❌ User not authenticated');
  }

  authReady.set(true);
  console.log('✅ Auth ready');
}

export async function signIn() {
  await logtoClient.signIn({
    redirectUri: `${window.location.origin}/callback`
  });
}

export async function signOut() {
  await logtoClient.signOut(window.location.origin);
}

export async function switchOrganization(orgId: string) {
  console.log('🔄 Switching to organization:', orgId);

  const orgs = get(userOrganizations);
  const org = orgs.find(o => o.id === orgId);

  if (!org) {
    console.error('Organization not found:', orgId);
    return;
  }

  currentOrganization.set(org);

  // Get access token with API resource AND organization context
  try {
    const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'https://api.booking-service.local';
    const token = await logtoClient.getAccessToken(apiResource, orgId);

    // Decode token to get scopes
    const payload = JSON.parse(atob(token.split('.')[1]));
    const scopes = typeof payload.scope === 'string'
      ? payload.scope.split(' ')
      : (payload.scope || []);

    userScopes.set(scopes);
    console.log('🔑 User scopes:', scopes);
  } catch (error) {
    console.error('Failed to get access token:', error);
    userScopes.set([]);
  }
}

export async function getOrganizationToken(): Promise<string> {
  const org = get(currentOrganization);
  if (!org) {
    throw new Error('No organization selected');
  }
  const apiResource = import.meta.env.VITE_LOGTO_API_RESOURCE || 'https://api.booking-service.local';
  return await logtoClient.getAccessToken(apiResource, org.id);
}
