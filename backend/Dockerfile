FROM oven/bun:latest
WORKDIR /app

# Install Doppler CLI for runtime secret injection.
COPY deploy/docker/doppler-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/doppler-entrypoint.sh \
    && apt-get update && apt-get install -y --no-install-recommends curl gnupg apt-transport-https ca-certificates \
    && curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" > /etc/apt/sources.list.d/doppler-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends doppler \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install dependencies (cache-friendly layer)
COPY backend/package.json backend/bun.lock ./
RUN bun install --frozen-lockfile

# Copy source and config
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY backend/tsconfig.json ./
COPY backend/drizzle.config.ts ./
RUN chmod +x ./scripts/start.sh

EXPOSE 5006

CMD ["./scripts/start.sh"]
