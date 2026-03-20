FROM oven/bun:latest AS builder
WORKDIR /app

# Copy blueprint and its AICO backend dependencies
COPY blueprint/package.json blueprint/bun.lock blueprint/tsconfig.json ./blueprint/
COPY blueprint/src ./blueprint/src/
COPY backend/entity-schema ./backend/entity-schema/
COPY backend/model-catalog ./backend/model-catalog/

# Copy admin manifests and install deps
COPY admin/package.json admin/bun.lock* ./
RUN bun install --frozen-lockfile

# Copy admin source
COPY admin/ ./

# Build without environment variables (will use runtime config)
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app/dist ./dist

# Create entrypoint script that injects runtime config
RUN cat <<'EOF' > /entrypoint.sh
#!/bin/sh
set -e

# Check required environment variables
if [ -z "${VITE_LOGTO_ENDPOINT:-}" ]; then
  echo "Missing required env var: VITE_LOGTO_ENDPOINT" >&2
  exit 1
fi
if [ -z "${VITE_LOGTO_APP_ID:-}" ]; then
  echo "Missing required env var: VITE_LOGTO_APP_ID" >&2
  exit 1
fi
if [ -z "${VITE_LOGTO_API_RESOURCE:-}" ]; then
  echo "Missing required env var: VITE_LOGTO_API_RESOURCE" >&2
  exit 1
fi
if [ -z "${VITE_BACKEND_URL:-}" ]; then
  echo "Missing required env var: VITE_BACKEND_URL" >&2
  exit 1
fi

cat > /app/dist/env-config.js << EOF_INNER
window.__ENV__ = {
  VITE_LOGTO_ENDPOINT: "${VITE_LOGTO_ENDPOINT}",
  VITE_LOGTO_ACCOUNT_CENTER_ENDPOINT: "${VITE_LOGTO_ACCOUNT_CENTER_ENDPOINT}",
  VITE_LOGTO_APP_ID: "${VITE_LOGTO_APP_ID}",
  VITE_LOGTO_API_RESOURCE: "${VITE_LOGTO_API_RESOURCE}",
  VITE_BACKEND_URL: "${VITE_BACKEND_URL}",
  VITE_WIDGET_URL: "${VITE_WIDGET_URL}",
  VITE_UPLOAD_MAX_FILE_SIZE_MB: "${VITE_UPLOAD_MAX_FILE_SIZE_MB:-5}"
};
EOF_INNER

exec "$@"
EOF

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "bun x serve -s dist -l ${ADMIN_PORT:-3000}"]
