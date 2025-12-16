FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies with Bun
RUN bun install --frozen-lockfile

# Copy source files and config
COPY . .

# Expose Vite dev server port
EXPOSE 5175

# Run Vite dev server (for development)
# For production, use: bun run build && bun run preview
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
