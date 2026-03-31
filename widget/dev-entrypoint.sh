#!/bin/sh
set -e

# Ensure deps are installed. The bind mount overwrites
# the image's node_modules with the host's.
if [ ! -x node_modules/.bin/vite ]; then
  echo "Installing widget dependencies..."
  bun install
fi

exec "$@"
