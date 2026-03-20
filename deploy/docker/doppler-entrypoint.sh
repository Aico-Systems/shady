#!/bin/bash
# =============================================================================
# Doppler Runtime Secret Injection
# =============================================================================
# This entrypoint wrapper injects secrets from Doppler at container startup.
# Used in production deployments where secrets are managed via Doppler.
#
# Required Environment Variables:
#   DOPPLER_TOKEN   - Service Account token (set on server, not in compose)
#   DOPPLER_PROJECT - Project name (default: shady)
#   DOPPLER_CONFIG  - Config name (prd for production)
#
# Usage in Dockerfile:
#   COPY deploy/docker/doppler-entrypoint.sh /usr/local/bin/
#   ENTRYPOINT ["/usr/local/bin/doppler-entrypoint.sh"]
#   CMD ["your-command"]
# =============================================================================

set -e

# Configuration with defaults
DOPPLER_PROJECT="${DOPPLER_PROJECT:-shady}"
DOPPLER_CONFIG="${DOPPLER_CONFIG:-prd}"

# Check if Doppler token is set
if [ -z "$DOPPLER_TOKEN" ]; then
    echo "========================================================"
    echo "  WARNING: DOPPLER_TOKEN not set"
    echo "========================================================"
    echo ""
    echo "Running without Doppler secret injection."
    echo "Secrets must be provided via environment variables or .env files."
    echo ""
    echo "For production deployments, configure Doppler:"
    echo "  Run: shady-deploy setup <env> <doppler-token>"
    echo ""

    # Run command without Doppler
    exec "$@"
fi

echo "Loading secrets from Doppler ($DOPPLER_PROJECT/$DOPPLER_CONFIG)..."

# Verify we can access secrets
if ! doppler secrets --token="$DOPPLER_TOKEN" --project="$DOPPLER_PROJECT" --config="$DOPPLER_CONFIG" >/dev/null 2>&1; then
    echo "ERROR: Failed to access Doppler secrets"
    echo "  Project: $DOPPLER_PROJECT"
    echo "  Config:  $DOPPLER_CONFIG"
    echo ""
    echo "Please verify:"
    echo "  1. The Service Account token is valid"
    echo "  2. The token has read access to $DOPPLER_PROJECT/$DOPPLER_CONFIG"
    exit 1
fi

# Run the application with Doppler injecting secrets at runtime
exec doppler run \
    --token="$DOPPLER_TOKEN" \
    --project="$DOPPLER_PROJECT" \
    --config="$DOPPLER_CONFIG" \
    -- "$@"
