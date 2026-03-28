#!/bin/sh
set -e

# Parameterized Drizzle Studio entrypoint for Shady
# Environment variables:
#   STUDIO_PORT   - Port to run on
#   DATABASE_URL  - Database connection string (optional; defaults to Docker-internal Postgres)

if [ -z "${STUDIO_PORT:-}" ]; then
  echo "STUDIO_PORT is required" >&2
  exit 1
fi

echo "Starting Drizzle Studio for Shady"
echo "Studio link: https://local.drizzle.studio?port=${STUDIO_PORT}&host=localhost"
echo ""

for env_file in /workspace/.env.dev /workspace/.env.dev.generated; do
  if [ -f "$env_file" ]; then
    echo "Loading environment from $env_file"
    export $(grep -v '^#' "$env_file" | grep -v '^$' | xargs)
  fi
done

export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER:-booking_user}:${POSTGRES_PASSWORD:-booking_password}@postgres:5432/${POSTGRES_DB:-booking_service}}"

echo "Using database connection: ${DATABASE_URL}"

echo "Installing Drizzle Studio dependencies"
npm install --silent drizzle-kit@latest pg@latest drizzle-orm@latest > /dev/null 2>&1

echo "Creating Drizzle configuration"
cat > drizzle.config.ts << 'CONFIGEOF'
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL
  },
  strict: true,
  verbose: true
});
CONFIGEOF

echo "Copying schema from backend"
cp /app/backend/src/db/schema.ts ./schema.ts

echo "Starting Drizzle Studio on port ${STUDIO_PORT}"
npx drizzle-kit studio --host 0.0.0.0 --port "${STUDIO_PORT}" --verbose
