#!/bin/sh
set -e

# Ensure deps are installed. The bind mount overwrites
# the image's node_modules with the host's.
if [ ! -d node_modules/.bin ]; then
  echo "Installing backend dependencies..."
  bun install
fi

exec "$@"
