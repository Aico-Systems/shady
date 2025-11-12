#!/bin/sh
set -e

# Drizzle Studio entrypoint for Booking Service (Shady)
# Environment variables:
#   STUDIO_PORT       - Port to run on (default: 4985)

STUDIO_PORT=${STUDIO_PORT:-4985}

echo "🚀 Starting Drizzle Studio for Booking Service..."
echo "Studio link: https://local.drizzle.studio?port=${STUDIO_PORT}&host=localhost"
echo ""

# Override DATABASE_URL to use Docker internal network
# The .env file has localhost:5436 for external access, but we need postgres:5432 internally
export DATABASE_URL=postgresql://booking_user:booking_password@postgres:5432/booking_service

echo "📄 Using database connection: postgres:5432/booking_service"

# Install dependencies
echo "📦 Installing drizzle-kit, pg, and drizzle-orm..."
npm install --silent drizzle-kit@0.31.5 pg@8.13.1 drizzle-orm@0.38.3 > /dev/null 2>&1

# Create drizzle config
echo "⚙️  Creating Drizzle configuration..."

cat > drizzle.config.ts << 'CONFIGEOF'
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://booking_user:booking_password@postgres:5432/booking_service'
  },
  strict: true,
  verbose: true
});
CONFIGEOF

# Copy schema from backend source
echo "📄 Copying schema from backend..."
cp /app/backend/src/db/schema.ts ./schema.ts

echo "✅ Setup complete!"
echo ""
echo "🎨 Starting Drizzle Studio on port ${STUDIO_PORT}..."
echo "🌐 Access at: https://local.drizzle.studio?port=${STUDIO_PORT}&host=localhost"
npx drizzle-kit studio --host 0.0.0.0 --port ${STUDIO_PORT} --verbose
