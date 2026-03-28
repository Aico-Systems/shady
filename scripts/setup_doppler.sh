#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env.dev"
PROJECT="shady"
CONFIG="dev"
SYNC_ONLY="${1:-}"

if ! command -v doppler >/dev/null 2>&1; then
  echo "Doppler CLI not found. Install it first."
  exit 1
fi

if ! doppler whoami >/dev/null 2>&1; then
  echo "Not authenticated with Doppler. Run: doppler login"
  exit 1
fi

if [ "$SYNC_ONLY" != "--sync-only" ]; then
  echo "Syncing Doppler secrets from $PROJECT/$CONFIG to $ENV_FILE"
fi

doppler secrets download --project "$PROJECT" --config "$CONFIG" --format env --no-file > "$ENV_FILE"
echo "Wrote $ENV_FILE"
