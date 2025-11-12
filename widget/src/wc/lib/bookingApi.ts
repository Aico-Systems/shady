/**
 * Booking Widget API Client
 * Communicates with the public booking API endpoints
 */

export interface AvailabilitySlot {
  startTime: string;
  endTime: string;
  userId: string;
  userName: string;
  userEmail: string;
}

export interface BookingConfig {
  visitorFields: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  bookingDurationMinutes: number;
  advanceBookingDays: number;
  widgetTheme?: Record<string, string>;
}

export interface CreateBookingData {
  userId: string;
  startTime: string;
  endTime: string;
  visitorData: {
    name?: string;
    email: string;
    phone?: string;
    [key: string]: any;
  };
  notes?: string;
}

export interface BookingResult {
  bookingId: string;
  startTime: string;
  endTime: string;
  googleMeetLink?: string;
  status: string;
}

export class BookingApi {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:5006') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get available time slots for an organization
   */
  async getAvailability(params: {
    orgId: string;
    startDate: Date;
    endDate: Date;
    durationMinutes?: number;
  }): Promise<AvailabilitySlot[]> {
    const query = new URLSearchParams({
      orgId: params.orgId,
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      ...(params.durationMinutes && { durationMinutes: params.durationMinutes.toString() })
    });

    const response = await fetch(`${this.baseUrl}/api/public/availability?${query}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch availability: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Create a new booking
   */
  async createBooking(bookingData: CreateBookingData): Promise<BookingResult> {
    const response = await fetch(`${this.baseUrl}/api/public/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookingData)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to create booking');
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get booking configuration for an organization
   */
  async getConfig(orgId: string): Promise<BookingConfig> {
    const response = await fetch(`${this.baseUrl}/api/public/config/${orgId}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }

  /**
   * Get a list of dates that have at least one available slot
   * Used to grey out unavailable days in the calendar
   */
  async getAvailableDates(params: {
    orgId: string;
    startDate: Date;
    endDate: Date;
    durationMinutes?: number;
  }): Promise<string[]> {
    const query = new URLSearchParams({
      orgId: params.orgId,
      startDate: params.startDate.toISOString(),
      endDate: params.endDate.toISOString(),
      ...(params.durationMinutes && { durationMinutes: params.durationMinutes.toString() })
    });

    const response = await fetch(`${this.baseUrl}/api/public/available-dates?${query}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch available dates: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data;
  }
}
