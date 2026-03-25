import {
  pgTable,
  text,
  jsonb,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  boolean,
  integer
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

/**
 * Booking Service Database Schema
 * Multi-tenant schema with organization_id scoping
 */

// ============================================================================
// ORGANIZATIONS
// ============================================================================

export const organizations = pgTable(
  'organizations',
  {
    id: text('id').primaryKey(), // Logto organization id
    name: text('name').notNull(),
    metadata: jsonb('metadata').default({}),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
  }
);

// ============================================================================
// BOOKING USERS
// ============================================================================

export const bookingUsers = pgTable(
  'booking_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name').notNull().default(''), // Cache from Logto, updated on admin access
    googleCalendarId: text('google_calendar_id'),
    googleRefreshToken: text('google_refresh_token'),
    googleAccessToken: text('google_access_token'),
    googleTokenExpiry: timestamp('google_token_expiry'),
    isActive: boolean('is_active').default(true),
    timezone: text('timezone').default('UTC'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
  },
  (table) => ({
    orgIdx: index('idx_booking_users_org').on(table.organizationId),
    orgEmailIdx: uniqueIndex('ux_booking_users_org_email').on(table.organizationId, table.email)
  })
);

// ============================================================================
// AVAILABILITY RULES
// ============================================================================

export const availabilityRules = pgTable(
  'availability_rules',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingUserId: uuid('booking_user_id')
      .notNull()
      .references(() => bookingUsers.id, { onDelete: 'cascade' }),
    dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday, 6 = Saturday
    startTime: text('start_time').notNull(), // HH:mm format (e.g., "09:00")
    endTime: text('end_time').notNull(), // HH:mm format (e.g., "17:00")
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
  },
  (table) => ({
    userIdx: index('idx_availability_rules_user').on(table.bookingUserId),
    userDayIdx: index('idx_availability_rules_user_day').on(
      table.bookingUserId,
      table.dayOfWeek
    )
  })
);

// ============================================================================
// BOOKINGS
// ============================================================================

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    bookingUserId: uuid('booking_user_id')
      .notNull()
      .references(() => bookingUsers.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }), // Denormalized for queries
    startTime: timestamp('start_time').notNull(),
    endTime: timestamp('end_time').notNull(),
    visitorData: jsonb('visitor_data').notNull(), // { name, email, phone, custom fields, etc. }
    googleEventId: text('google_event_id'), // Google Calendar Event ID
    googleMeetLink: text('google_meet_link'), // Google Meet video link (if created)
    status: text('status').default('confirmed'), // confirmed, cancelled, completed
    cancellationReason: text('cancellation_reason'), // If cancelled
    notes: text('notes'), // Optional notes
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
  },
  (table) => ({
    userIdx: index('idx_bookings_user').on(table.bookingUserId),
    orgIdx: index('idx_bookings_org').on(table.organizationId),
    timeIdx: index('idx_bookings_time').on(table.startTime, table.endTime),
    statusIdx: index('idx_bookings_status').on(table.status),
    googleEventIdx: index('idx_bookings_google_event').on(table.googleEventId)
  })
);

// ============================================================================
// GOOGLE CALENDAR SYNC STATE
// ============================================================================

export const calendarSyncState = pgTable(
  'calendar_sync_state',
  {
    bookingUserId: uuid('booking_user_id')
      .primaryKey()
      .references(() => bookingUsers.id, { onDelete: 'cascade' }),
    syncToken: text('sync_token'), // Google Calendar sync token for incremental sync
    pageToken: text('page_token'), // For pagination
    lastSyncedAt: timestamp('last_synced_at'),
    lastSyncStatus: text('last_sync_status').default('success'), // success, error
    lastSyncError: text('last_sync_error'), // Error message if failed
    updatedAt: timestamp('updated_at').defaultNow()
  }
);

// ============================================================================
// ORGANIZATION BOOKING CONFIGS
// ============================================================================

export const bookingConfigs = pgTable(
  'booking_configs',
  {
    organizationId: text('organization_id')
      .primaryKey()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    bookingSlug: text('booking_slug').unique().notNull(), // Public-facing identifier (e.g., "acme-corp")
    visitorFields: jsonb('visitor_fields').default([
      { name: 'name', label: 'Full Name', type: 'text', required: true },
      { name: 'email', label: 'Email Address', type: 'email', required: true },
      { name: 'phone', label: 'Phone Number', type: 'tel', required: false }
    ]), // Dynamic form fields for visitors
    bookingDurationMinutes: integer('booking_duration_minutes').default(30),
    advanceBookingDays: integer('advance_booking_days').default(30), // How far in advance bookings can be made
    bufferMinutes: integer('buffer_minutes').default(0), // Buffer time between bookings
    emailEnabled: boolean('email_enabled').default(true),
    emailTemplateSubject: text('email_template_subject').default('Your Booking Confirmation'),
    emailTemplateBody: text('email_template_body'), // Can contain placeholders like {{userName}}, {{date}}, etc.
    widgetTheme: jsonb('widget_theme').default({}), // Custom colors, fonts, etc.
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow()
  },
  (table) => ({
    slugIdx: uniqueIndex('ux_booking_configs_slug').on(table.bookingSlug)
  })
);

// ============================================================================
// CMS SITE CONTENT
// ============================================================================

export const cmsSiteContent = pgTable(
  'cms_site_content',
  {
    key: text('key').primaryKey(),
    draftContent: jsonb('draft_content').default({}),
    publishedContent: jsonb('published_content').default({}),
    updatedBy: text('updated_by'),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    publishedAt: timestamp('published_at')
  }
);

// ============================================================================
// CMS BLOG POSTS
// ============================================================================

export const cmsBlogPosts = pgTable(
  'cms_blog_posts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    locale: text('locale').notNull().default('en'),
    title: text('title').notNull(),
    excerpt: text('excerpt').notNull().default(''),
    body: text('body').notNull().default(''),
    category: text('category').notNull().default('Journal'),
    tags: jsonb('tags').default([]),
    coverImageUrl: text('cover_image_url'),
    authorName: text('author_name').notNull().default('AICO'),
    authorRole: text('author_role').notNull().default('Editorial'),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    readingTimeMinutes: integer('reading_time_minutes'),
    status: text('status').notNull().default('draft'),
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    publishedBy: text('published_by'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
    publishedAt: timestamp('published_at')
  },
  (table) => ({
    slugLocaleIdx: uniqueIndex('ux_cms_blog_posts_slug_locale').on(
      table.slug,
      table.locale
    ),
    statusPublishedIdx: index('idx_cms_blog_posts_status_published').on(
      table.status,
      table.publishedAt
    )
  })
);

// ============================================================================
// RELATIONS (for Drizzle ORM query builder)
// ============================================================================

export const organizationsRelations = relations(organizations, ({ many, one }) => ({
  bookingUsers: many(bookingUsers),
  bookings: many(bookings),
  bookingConfig: one(bookingConfigs)
}));

export const bookingUsersRelations = relations(bookingUsers, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [bookingUsers.organizationId],
    references: [organizations.id]
  }),
  availabilityRules: many(availabilityRules),
  bookings: many(bookings),
  syncState: one(calendarSyncState)
}));

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  bookingUser: one(bookingUsers, {
    fields: [availabilityRules.bookingUserId],
    references: [bookingUsers.id]
  })
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  organization: one(organizations, {
    fields: [bookings.organizationId],
    references: [organizations.id]
  }),
  bookingUser: one(bookingUsers, {
    fields: [bookings.bookingUserId],
    references: [bookingUsers.id]
  })
}));

export const calendarSyncStateRelations = relations(calendarSyncState, ({ one }) => ({
  bookingUser: one(bookingUsers, {
    fields: [calendarSyncState.bookingUserId],
    references: [bookingUsers.id]
  })
}));

export const bookingConfigsRelations = relations(bookingConfigs, ({ one }) => ({
  organization: one(organizations, {
    fields: [bookingConfigs.organizationId],
    references: [organizations.id]
  })
}));

// ============================================================================
// TYPE EXPORTS (for use in services)
// ============================================================================

export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;

export type BookingUser = typeof bookingUsers.$inferSelect;
export type NewBookingUser = typeof bookingUsers.$inferInsert;

export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type CalendarSyncState = typeof calendarSyncState.$inferSelect;
export type NewCalendarSyncState = typeof calendarSyncState.$inferInsert;

export type BookingConfig = typeof bookingConfigs.$inferSelect;
export type NewBookingConfig = typeof bookingConfigs.$inferInsert;
