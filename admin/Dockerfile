FROM oven/bun:latest AS builder
WORKDIR /workspace/shady/admin

# Copy blueprint and its AICO backend dependencies
COPY blueprint/package.json blueprint/bun.lock blueprint/tsconfig.json /workspace/blueprint/
COPY blueprint/src /workspace/blueprint/src/
COPY backend/entity-schema /workspace/backend/entity-schema/
COPY backend/model-catalog /workspace/backend/model-catalog/

# Copy admin manifests and install deps
COPY admin/package.json admin/bun.lock* /workspace/shady/admin/
RUN bun install --frozen-lockfile
RUN ln -s /workspace/shady/admin/node_modules /workspace/node_modules

# Copy admin source
COPY admin/ /workspace/shady/admin/

# Build without environment variables (will use runtime config)
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /workspace/shady/admin/dist ./dist

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
  VITE_AICO_API_URL: "${VITE_AICO_API_URL}",
  VITE_UPLOAD_MAX_FILE_SIZE_MB: "${VITE_UPLOAD_MAX_FILE_SIZE_MB:-5}"
};
EOF_INNER

exec "$@"
EOF

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "bun x serve -s dist -l ${ADMIN_PORT:-3000}"]
