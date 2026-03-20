FROM oven/bun:latest AS builder
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build IIFE widget bundle
RUN bun run build

FROM oven/bun:latest
WORKDIR /app
COPY --from=builder /app/dist ./dist
RUN cat <<'EOF' > /entrypoint.sh
#!/bin/sh
set -e

cat > /app/dist/env-config.js << EOF_INNER
window.__ENV__ = {
  VITE_BACKEND_URL: "${VITE_BACKEND_URL}",
  VITE_WIDGET_URL: "${VITE_WIDGET_URL}",
  VITE_WIDGET_DEFAULT_ORG: "${VITE_WIDGET_DEFAULT_ORG}"
};
EOF_INNER

exec "$@"
EOF

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "-c", "bun x serve -s dist -l ${WIDGET_PORT:-3001}"]
