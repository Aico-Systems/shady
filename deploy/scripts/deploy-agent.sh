#!/bin/bash
set -euo pipefail

# =============================================================================
# Shady Deploy Agent — Webhook-based CD
# =============================================================================
# CI builds images, pushes to GHCR, then POSTs to the deploy webhook.
# The webhook listener (deploy-webhook.ts) receives the POST and calls
# this script's `deploy` command.
#
# Commands:
#   setup <env> <doppler-token>  — First-time server setup
#   deploy                       — Force deploy now
#   status                       — Show current state
# =============================================================================

CONF_FILE="/etc/shady/deploy.conf"
INSTALL_DIR="/opt/shady"
DEPLOY_DIR="${INSTALL_DIR}/deploy"
INFRA_DIR="${INSTALL_DIR}/infra"
REPO_URL="https://github.com/Aico-Systems/shady.git"
REGISTRY="ghcr.io"
DOPPLER_PROJECT="shady"

# --- Env mapping ---

resolve_env() {
    local env="$1"
    case "$env" in
        prod)    DEPLOY_BRANCH="main"; IMAGE_TAG="main"; DOPPLER_CONFIG="prd" ;;
        dev)     DEPLOY_BRANCH="main"; IMAGE_TAG="dev";  DOPPLER_CONFIG="dev" ;;
        *)       echo "Unknown environment: $env"; exit 1 ;;
    esac
}

# --- Helpers ---

log() { echo "[deploy-agent] $(date '+%H:%M:%S') $*"; }

load_conf() {
    if [[ ! -f "$CONF_FILE" ]]; then
        echo "No config found at $CONF_FILE. Run: shady-deploy setup <env> <doppler-token>"
        exit 1
    fi
    # shellcheck disable=SC1090
    source "$CONF_FILE"
    resolve_env "$SHADY_ENV"
}

get_doppler_secret() {
    local key="$1"
    doppler secrets get "$key" --plain \
        --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token "$DOPPLER_TOKEN"
}

# Fetch PAT from Doppler, authenticate with GHCR and git
authenticate() {
    local pat
    pat=$(get_doppler_secret DEPLOY_GITHUB_PAT)
    GITHUB_PAT="$pat"

    # Docker registry auth (for image pull)
    echo "$pat" | docker login "$REGISTRY" -u shady-deploy --password-stdin >/dev/null 2>&1

    # Git auth (for fetch)
    git config --global --add safe.directory "$INSTALL_DIR"
    git config --global credential.helper store
    echo "https://x-access-token:${pat}@github.com" > ~/.git-credentials
    git config --global url.'https://github.com/'.insteadOf 'git@github.com:'
}

repo_owner() {
    echo "$REPO_URL" | sed -E 's|.*/([^/]+)/[^/]+\.git$|\1|' | tr '[:upper:]' '[:lower:]'
}

# Update repo to latest
update_repo() {
    cd "$INSTALL_DIR"
    git fetch origin
    git reset --hard "origin/$DEPLOY_BRANCH"
    git clean -fd
}

export_env() {
    export IMAGE_TAG REGISTRY SHADY_ENV DOPPLER_TOKEN
    REPO_OWNER=$(repo_owner)
    export REPO_OWNER
}

# --- Commands ---

cmd_setup() {
    local env="${1:-}"
    local token="${2:-}"

    if [[ -z "$env" || -z "$token" ]]; then
        echo "Usage: shady-deploy setup <env> <doppler-token>"
        echo "  env: prod | dev"
        exit 1
    fi

    resolve_env "$env"

    # Write config
    mkdir -p /etc/shady
    cat > "$CONF_FILE" <<EOF
SHADY_ENV=$env
DOPPLER_TOKEN=$token
EOF
    chmod 600 "$CONF_FILE"
    log "Config written to $CONF_FILE (env=$env)"

    # Export for this session
    export SHADY_ENV="$env"
    export DOPPLER_TOKEN="$token"

    # Authenticate with Doppler → GHCR + git
    log "Authenticating via Doppler ($DOPPLER_PROJECT/$DOPPLER_CONFIG)..."
    authenticate
    log "Authenticated with GHCR and git"

    # Clone repo if not present
    if [[ ! -d "$INSTALL_DIR/.git" ]]; then
        log "Cloning repo to $INSTALL_DIR..."
        git clone --branch "$DEPLOY_BRANCH" \
            "https://x-access-token:${GITHUB_PAT}@github.com/Aico-Systems/shady.git" \
            "$INSTALL_DIR"
    else
        log "Repo already exists, updating..."
        cd "$INSTALL_DIR"
        git fetch origin
        git checkout -f "$DEPLOY_BRANCH" 2>/dev/null || git checkout -f -b "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
        git reset --hard "origin/$DEPLOY_BRANCH"
        git clean -fd
    fi

    # Run deploy
    log "Running initial deploy..."
    export_env
    bash "$DEPLOY_DIR/scripts/deploy.sh" deploy

    # Enable webhook listener
    log "Enabling deploy webhook listener..."
    systemctl daemon-reload
    systemctl enable --now shady-deploy-webhook
    log "Setup complete. Deploy webhook listening on port 9090."
}

cmd_deploy() {
    load_conf
    authenticate
    update_repo

    export_env
    bash "$DEPLOY_DIR/scripts/deploy.sh" deploy

    log "Deploy complete ($IMAGE_TAG)"
}

cmd_status() {
    if [[ ! -f "$CONF_FILE" ]]; then
        echo "Not configured. Run: shady-deploy setup <env> <doppler-token>"
        exit 0
    fi

    load_conf

    echo "=== Shady Deploy Agent ==="
    echo "Environment:  $SHADY_ENV"
    echo "Branch:       $DEPLOY_BRANCH"
    echo "Image tag:    $IMAGE_TAG"
    echo "Doppler:      $DOPPLER_PROJECT/$DOPPLER_CONFIG"
    echo ""

    # Webhook listener status
    echo "--- Webhook ---"
    systemctl status shady-deploy-webhook --no-pager 2>/dev/null || echo "Webhook listener not active"
    echo ""

    # Git status
    echo "--- Git ---"
    cd "$INSTALL_DIR" 2>/dev/null && git log --oneline -3 2>/dev/null || echo "Repo not cloned"
    echo ""

    # Docker services
    echo "--- Services ---"
    docker compose -p shady -f "$DEPLOY_DIR/docker-compose.registry.yml" ps 2>/dev/null || echo "Services not running"
}

# --- Main ---

case "${1:-}" in
    setup)       shift; cmd_setup "$@" ;;
    deploy)      cmd_deploy ;;
    status)      cmd_status ;;
    *)
        echo "Shady Deploy Agent"
        echo ""
        echo "Usage: shady-deploy <command> [args]"
        echo ""
        echo "Commands:"
        echo "  setup <env> <doppler-token>  First-time server setup"
        echo "  deploy                       Force deploy now"
        echo "  status                       Show current state"
        exit 1
        ;;
esac
