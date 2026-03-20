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

# Serve static widget files
CMD ["sh", "-c", "bun x serve -s dist -l ${WIDGET_PORT:-3001}"]
