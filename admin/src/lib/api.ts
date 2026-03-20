// API client for booking service backend
import { auth, currentOrganization } from "@aico/blueprint";
import { get } from "svelte/store";
import config from "./config";

const BASE_URL = config.API_URL;

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers = new Headers(options?.headers);
  const organization = get(currentOrganization);
  const token = auth.getAccessToken
    ? await auth.getAccessToken(config.LOGTO_API_RESOURCE, organization?.id)
    : null;

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (organization?.id && !headers.has("X-Organization-Id")) {
    headers.set("X-Organization-Id", organization.id);
  }

  if (options?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} ${error}`);
  }

  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'API call failed');
  }

  return data.data as T;
}

// Types — user list merges Logto identity + local calendar state
export interface OrgMember {
  // From Logto (source of truth)
  email: string;
  displayName: string;
  avatar: string | null;
  roles: string[];
  // From local DB (null if no calendar connection yet)
  localId: string | null;
  isActive: boolean;
  hasGoogleCalendar: boolean;
  timezone: string;
  createdAt: string | null;
}

export interface AvailabilityRule {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface Booking {
  id: string;
  bookingUserId: string;
  startTime: string;
  endTime: string;
  visitorData: Record<string, any>;
  googleEventId?: string;
  googleMeetLink?: string;
  status: string;
  notes?: string;
  createdAt: string;
}

export interface BookingWithUser extends Booking {
  user: {
    id: string;
    displayName: string;
    email: string;
  };
}

export interface BookingConfig {
  organizationId: string;
  bookingSlug?: string;
  visitorFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  bookingDurationMinutes: number;
  advanceBookingDays: number;
  bufferMinutes?: number;
  emailEnabled: boolean;
}

export interface BookingStats {
  total: number;
  confirmed: number;
  cancelled: number;
  upcomingCount: number;
}

// Users API
export const usersApi = {
  list: () => apiCall<OrgMember[]>('/api/admin/users'),

  create: (data: {
    email: string;
    displayName?: string;
    timezone?: string;
    isActive?: boolean;
  }) => apiCall<any>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  update: (id: string, data: { timezone?: string; isActive?: boolean }) =>
    apiCall<any>(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  connectGoogle: (id: string) =>
    apiCall<{ authUrl: string }>(`/api/admin/users/${id}/google-connect`, {
      method: 'POST'
    })
};

// Availability API
export const availabilityApi = {
  get: (userId: string) =>
    apiCall<AvailabilityRule[]>(`/api/admin/users/${userId}/availability`),

  update: (userId: string, rules: Array<{
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    isActive: boolean;
  }>) => apiCall<AvailabilityRule[]>(`/api/admin/users/${userId}/availability`, {
    method: 'PUT',
    body: JSON.stringify({ rules })
  })
};

// Bookings API
export const bookingsApi = {
  list: (params?: {
    userId?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  }) => {
    const filteredParams = Object.fromEntries(
      Object.entries(params ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
    );
    const query = new URLSearchParams(filteredParams).toString();
    const path = query ? `/api/admin/bookings?${query}` : '/api/admin/bookings';
    return apiCall<BookingWithUser[]>(path);
  },

  cancel: (id: string, reason?: string) =>
    apiCall<Booking>(`/api/admin/bookings/${id}/cancel`, {
      method: 'PUT',
      body: JSON.stringify({ reason })
    }),

  stats: () => apiCall<BookingStats>('/api/admin/bookings/stats')
};

// Config API
export const configApi = {
  get: () => apiCall<BookingConfig>('/api/admin/config'),

  update: (data: Partial<BookingConfig>) =>
    apiCall<BookingConfig>('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify(data)
    })
};
