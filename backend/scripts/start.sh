#!/bin/sh
set -eu

echo "[shady-backend] Applying schema with drizzle-kit push..."
bunx drizzle-kit push --force

echo "[shady-backend] Starting backend..."
exec bun src/main.ts
