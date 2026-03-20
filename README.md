# Shady - Standalone Calendar Booking Service

A standalone booking microservice with Google Calendar synchronization, built to sit next to AICO while reusing the same Logto and blueprint conventions.

## 🎯 MVP Features

✅ **Implemented:**
- Standalone Postgres database with Drizzle ORM
- Google Calendar OAuth & sync
- Smart availability aggregation across all users
- Booking creation with conflict detection
- Email notifications (MailSend integration)
- Logto authentication for admin portal
- Multi-tenant organization support
- Docker Compose stack with dedicated ports that do not overlap the current AICO dev ports

🚧 **Active cleanup areas:**
- Production hardening for secrets and OAuth credential handling
- Schema migration workflow for existing local databases
- Widget packaging polish beyond the standalone `widget.js` bundle

## 📁 Project Structure

```
shady/
├── docker-compose.yml       ✅ Standalone stack configuration
├── .env                      ✅ Environment configuration
├── google.json               ✅ Google OAuth credentials
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.ts      ✅ Configuration loader
│   │   ├── db/
│   │   │   ├── schema.ts     ✅ Drizzle schema (5 tables)
│   │   │   ├── index.ts      ✅ Database connection
│   │   │   └── init/
│   │   │       └── 01_extensions.sql  ✅ SQL init
│   │   ├── services/
│   │   │   ├── GoogleCalendarService.ts  ✅ OAuth & Calendar API
│   │   │   ├── AvailabilityService.ts    ✅ Smart slot aggregation
│   │   │   ├── BookingService.ts         ✅ Booking management
│   │   │   └── MailSendService.ts        ✅ Email notifications
│   │   ├── utils/
│   │   │   └── logtoAuth.ts  ✅ JWT verification
│   │   ├── types/
│   │   │   └── index.ts      ✅ TypeScript types
│   │   ├── logger.ts         ✅ Logging utility
│   │   ├── main.ts           🚧 Entry point (TODO)
│   │   └── routes/
│   │       ├── router.ts     🚧 Main router (TODO)
│   │       ├── publicRoutes.ts   🚧 Widget API (TODO)
│   │       └── adminRoutes.ts    🚧 Admin API (TODO)
│   ├── package.json          ✅ Dependencies defined
│   ├── tsconfig.json         ✅ TypeScript config
│   ├── drizzle.config.ts     ✅ Drizzle config
│   └── Dockerfile            ✅ Container definition
├── admin/                    🚧 Admin UI (Svelte)
└── widget/                   🚧 Embeddable widget
```

## 🗄️ Database Schema

### Tables Created

1. **booking_users** - Users who can be booked (linked to Logto)
   - Google Calendar connection status
   - Timezone, display name, email

2. **availability_rules** - Weekly schedule per user
   - Day of week (0-6)
   - Start/end times (HH:mm format)

3. **bookings** - Appointments
   - Visitor data (JSONB - configurable fields)
   - Google Calendar event ID
   - Google Meet link
   - Status (confirmed/cancelled)

4. **calendar_sync_state** - Google Calendar sync tokens
   - Incremental sync support

5. **booking_configs** - Organization settings
   - Configurable visitor form fields
   - Booking duration, advance window
   - Email templates

## 🚀 Quick Start

### Prerequisites

1. **Logto Configuration** - Get from your main app:
   ```bash
   LOGTO_ENDPOINT=http://localhost:3001
   LOGTO_MANAGEMENT_APP_ID=...
   LOGTO_MANAGEMENT_APP_SECRET=...
   ```

2. **MailSend API Token** (optional for MVP testing):
   ```bash
   MAILSEND_API_TOKEN=your_token_here
   ```

### Setup

1. **Install dependencies:**
   ```bash
   cd shady/backend
   bun install
   ```

2. **Start database:**
   ```bash
   cd shady
   docker-compose up postgres -d
   ```

3. **Generate & run migrations:**
   ```bash
   cd backend
   bun run db:generate
   # Migrations are in backend/drizzle/
   ```

4. **Start backend (once completed):**
   ```bash
   bun run dev
   ```

## 📝 Remaining Implementation

### 1. Backend Routes (PRIORITY)

Create `backend/src/main.ts`:
```typescript
import { config } from './config';
import { getLogger } from './logger';
import { handleRoute } from './routes/router';

const logger = getLogger('main');

async function startServer() {
  logger.info('Starting Booking Service...');

  // Initialize database
  await import('./db');

  // Start HTTP server
  Bun.serve({
    port: config.PORT,
    async fetch(request: Request) {
      return await handleRoute(request);
    }
  });

  logger.info(`✓ Booking Service ready on port ${config.PORT}`);
}

startServer().catch(error => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});
```

Create `backend/src/routes/router.ts`:
```typescript
import { validateLogtoToken, LogtoAuthError } from '../utils/logtoAuth';
import { getLogger } from '../logger';
import { handlePublicRoutes } from './publicRoutes';
import { handleAdminRoutes } from './adminRoutes';

const logger = getLogger('router');

export async function handleRoute(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Public routes (no auth)
    if (url.pathname.startsWith('/api/public/')) {
      return await handlePublicRoutes(request, url);
    }

    // Admin routes (require Logto auth)
    if (url.pathname.startsWith('/api/admin/')) {
      const authHeader = request.headers.get('Authorization');
      const userContext = await validateLogtoToken(authHeader);
      return await handleAdminRoutes(request, url, userContext);
    }

    // Health check
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    return new Response('Not Found', { status: 404, headers: corsHeaders });
  } catch (error) {
    if (error instanceof LogtoAuthError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: error.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders }
      });
    }

    logger.error('Request error', { error });
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
}
```

Create `backend/src/routes/publicRoutes.ts` - See services for implementation
Create `backend/src/routes/adminRoutes.ts` - See services for implementation

### 2. Admin UI (Svelte)

**Structure:**
```
admin/
├── src/
│   ├── App.svelte           # Main app with routing
│   ├── lib/
│   │   ├── auth.ts          # Copy from main frontend
│   │   ├── pages/
│   │   │   ├── UsersPage.svelte
│   │   │   ├── AvailabilityPage.svelte
│   │   │   ├── BookingsPage.svelte
│   │   │   └── ConfigPage.svelte
│   │   └── components/
│   │       ├── WeeklyScheduleEditor.svelte
│   │       └── VisitorFieldsEditor.svelte
│   └── main.ts
├── package.json
├── vite.config.ts
└── Dockerfile
```

**Key Features:**
- User management (enable/disable for booking)
- Weekly schedule editor (Mon-Sun, time ranges)
- Google Calendar connection flow
- Booking list with filters
- Visitor form field configurator

### 3. Embeddable Widget

**Build as Web Component:**
```typescript
// widget/src/main.ts
import BookingWidget from './BookingWidget.svelte';

class BookingWidgetElement extends HTMLElement {
  connectedCallback() {
    const orgId = this.getAttribute('org-id');
    new BookingWidget({
      target: this,
      props: { organizationId: orgId }
    });
  }
}

customElements.define('booking-widget', BookingWidgetElement);
```

**Widget Flow:**
1. Date picker → Shows available dates
2. Time slot picker → Shows all users' slots aggregated
3. Visitor form → Dynamic fields from config
4. Confirmation → Success message

## 🔑 Key Services Implemented

### GoogleCalendarService
- ✅ OAuth 2.0 flow
- ✅ Token refresh handling
- ✅ Event CRUD operations
- ✅ Incremental sync with sync tokens
- ✅ Google Meet link generation

### AvailabilityService
- ✅ Multi-user slot aggregation
- ✅ Weekly schedule rules
- ✅ Google Calendar busy time detection
- ✅ Conflict detection with buffer time
- ✅ Future-only slots (no past booking)

### BookingService
- ✅ Availability validation
- ✅ Database transaction handling
- ✅ Google Calendar event creation
- ✅ Booking statistics
- ✅ Cancellation with cleanup

### MailSendService
- ✅ HTML email templates
- ✅ Visitor confirmation emails
- ✅ User notification emails
- ✅ Cancellation emails
- 🚧 Actual API integration (commented with TODO)

## 🔐 Security

- **Authentication:** Logto JWT tokens
- **Authorization:** Organization-scoped (users can only manage their org's bookings)
- **Google OAuth:** Refresh tokens stored encrypted (TODO: add encryption)
- **Public API:** Rate limiting recommended for production

## 📊 API Endpoints

### Public (Widget)
```
GET  /api/public/availability?orgId=xxx&start=...&end=...
POST /api/public/bookings
GET  /api/public/config/:orgId
```

### Admin (Logto Protected)
```
# Users
GET  /api/admin/users
POST /api/admin/users
PUT  /api/admin/users/:id
POST /api/admin/users/:id/google-connect

# Availability
GET  /api/admin/users/:id/availability
PUT  /api/admin/users/:id/availability

# Bookings
GET  /api/admin/bookings
PUT  /api/admin/bookings/:id/cancel

# Config
GET  /api/admin/config
PUT  /api/admin/config
```

## 🧪 Testing

1. **Start services:**
   ```bash
   docker-compose up
   ```

2. **Test availability API:**
   ```bash
   curl "http://localhost:5006/api/public/availability?orgId=org_xxx&start=2025-01-15&end=2025-01-20"
   ```

3. **Test booking creation:**
   ```bash
   curl -X POST http://localhost:5006/api/public/bookings \
     -H "Content-Type: application/json" \
     -d '{
       "userId": "user_id",
       "startTime": "2025-01-15T14:00:00Z",
       "endTime": "2025-01-15T14:30:00Z",
       "visitorData": {
         "name": "John Doe",
         "email": "john@example.com"
       }
     }'
   ```

## 🚀 Next Steps

1. ✅ **Backend Core** - COMPLETED
   - Database schema
   - Services (Google Calendar, Availability, Booking, Email)
   - Authentication

2. 🔄 **Backend API** - IN PROGRESS
   - Complete main.ts
   - Implement publicRoutes.ts
   - Implement adminRoutes.ts

3. 📝 **Admin UI** - TODO
   - Setup Svelte app
   - Build user management page
   - Build availability editor
   - Build bookings list
   - Build config page

4. 🎨 **Widget** - TODO
   - Setup web component build
   - Build date/time picker
   - Build dynamic form
   - Style and theming

5. 🧪 **Testing & Polish** - TODO
   - End-to-end testing
   - Error handling improvements
   - Performance optimization
   - Documentation

## 📚 Resources

- [Logto Documentation](https://docs.logto.io/)
- [Google Calendar API](https://developers.google.com/calendar)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Svelte](https://svelte.dev/)

---

**Estimated Completion Time:**
- Backend API: 4-6 hours
- Admin UI: 8-12 hours
- Widget: 6-8 hours
- Testing: 4-6 hours
**Total: 22-32 hours to complete MVP**
# shady
# shady
