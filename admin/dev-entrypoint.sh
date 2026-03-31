#!/bin/sh
set -e

# Ensure deps are installed. The bind mount overwrites the image's
# node_modules. Check for vite (a direct dep) rather than @aico/blueprint
# (which is mounted separately via docker-compose volumes).
if [ ! -x node_modules/.bin/vite ]; then
  echo "Installing admin dependencies..."
  bun install
fi

exec "$@"
