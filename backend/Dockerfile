FROM oven/bun:1.1.38

WORKDIR /app

COPY package.json tsconfig.json ./

# Install dependencies with Bun
RUN bun install --frozen-lockfile

COPY src ./src

EXPOSE 5006

CMD ["bun", "--watch", "src/main.ts"]
