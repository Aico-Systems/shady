// API client for booking service backend

const BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5006';

async function apiCall<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);

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

// Types
export interface BookingUser {
  id: string;
  logtoUserId: string;
  email: string;
  displayName: string;
  isActive: boolean;
  hasGoogleCalendar: boolean;
  timezone: string;
  createdAt: string;
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
  list: () => apiCall<BookingUser[]>('/api/admin/users'),

  get: (id: string) => apiCall<BookingUser>(`/api/admin/users/${id}`),

  create: (data: {
    logtoUserId?: string;
    email: string;
    displayName: string;
    timezone?: string;
    isActive?: boolean;
  }) => apiCall<BookingUser>('/api/admin/users', {
    method: 'POST',
    body: JSON.stringify(data)
  }),

  update: (id: string, data: Partial<BookingUser>) =>
    apiCall<BookingUser>(`/api/admin/users/${id}`, {
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
    const query = new URLSearchParams(params as Record<string, string>).toString();
    return apiCall<BookingWithUser[]>(`/api/admin/bookings?${query}`);
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
