// Common API response types

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    total: number;
    offset: number;
    limit: number;
  };
}

// Request types
export interface CreateBookingRequest {
  userId: string;
  startTime: string; // ISO string
  endTime: string; // ISO string
  visitorData: {
    name?: string;
    email?: string;
    phone?: string;
    [key: string]: any;
  };
  notes?: string;
}

export interface AvailabilityRequest {
  startDate: string; // ISO string
  endDate: string; // ISO string
  durationMinutes?: number;
}

export interface UpdateAvailabilityRequest {
  rules: Array<{
    dayOfWeek: number;
    startTime: string; // HH:mm
    endTime: string; // HH:mm
    isActive: boolean;
  }>;
}

export interface UpdateBookingConfigRequest {
  bookingSlug?: string; // Public-facing identifier for widget embedding
  visitorFields?: Array<{
    name: string;
    label: string;
    type: string;
    required: boolean;
  }>;
  bookingDurationMinutes?: number;
  advanceBookingDays?: number;
  bufferMinutes?: number;
  emailEnabled?: boolean;
  emailTemplateSubject?: string;
  emailTemplateBody?: string;
  widgetTheme?: Record<string, any>;
}
