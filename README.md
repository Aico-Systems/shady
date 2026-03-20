# Shady - Standalone Calendar Booking Service

A standalone booking microservice with Google Calendar synchronization, built to sit next to AICO while reusing the same Logto and blueprint conventions.

Shady now uses the shared AICO Logto tenant, shared organizations, and the canonical booking scopes provisioned by the root `scripts/logto/logto-setup.js` flow. There is no separate Shady-specific Logto bootstrap anymore.

The admin no longer vendors a nested `blueprint` submodule. Local development uses the sibling monorepo path `../blueprint`, and standalone CI checks out `Aico-Systems/blueprint` explicitly during the admin image build.

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
│   │   ├── main.ts           ✅ Entry point
│   │   └── routes/
│   │       ├── router.ts     ✅ Main router
│   │       ├── publicRoutes.ts   ✅ Widget API
│   │       └── adminRoutes.ts    ✅ Admin API
│   ├── package.json          ✅ Dependencies defined
│   ├── tsconfig.json         ✅ TypeScript config
│   ├── drizzle.config.ts     ✅ Drizzle config
│   └── Dockerfile            ✅ Container definition
├── admin/                    ✅ Admin UI (Svelte)
└── widget/                   ✅ Embeddable widget
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

1. **Shared Logto Configuration** - Start the main AICO auth stack first:
   ```bash
   make auth
   ```
   Then, from `shady/`, run:
   ```bash
   make logto-setup
   ```

2. **MailSend API Token** (optional for MVP testing):
   ```bash
   MAILSEND_API_TOKEN=your_token_here
   ```

### Setup

1. **Sync shared Logto configuration:**
   ```bash
   cd shady
   make logto-setup
   ```

2. **Start the Shady stack:**
   ```bash
   make up
   ```

3. **Open Drizzle Studio if needed:**
   ```bash
   make db-studio
   ```

4. **Push schema changes if you edit the DB schema:**
   ```bash
   make db-migrate
   ```

## Notes

- Shady uses the shared AICO API resource `https://api.aico.local` and canonical booking scopes such as `bookings:read` and `bookings:manage_users`.
- The Shady admin SPA app ID is provisioned by the root Logto setup and written back into `shady/.env`.

## 🔐 Security

- **Authentication:** Logto JWT tokens
- **Authorization:** Organization-scoped with canonical booking scopes enforced in the backend
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
   make up
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

## 📚 Resources

- [Logto Documentation](https://docs.logto.io/)
- [Google Calendar API](https://developers.google.com/calendar)
- [Drizzle ORM](https://orm.drizzle.team/)
- [Svelte](https://svelte.dev/)
