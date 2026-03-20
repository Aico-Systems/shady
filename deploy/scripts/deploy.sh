#!/bin/bash
set -e

# =============================================================================
# Shady Deployment Script
# =============================================================================
# Called by deploy-agent.sh on the server (webhook-triggered CD).
#
# Entrypoint:
#   deploy — Full deploy: pull images, migrate schema, restart services
#
# All paths are absolute — no cwd dependencies.
# =============================================================================

# Paths
INSTALL_DIR="/opt/shady"
DEPLOY_DIR="${INSTALL_DIR}/deploy"
PROJECT_ROOT="${INSTALL_DIR}"
INFRA_DIR="${PROJECT_ROOT}/infra"

# Environment
ENV_NAME="${SHADY_ENV:-prod}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

# Doppler
DOPPLER_PROJECT="shady"
case "$ENV_NAME" in
    dev)  DOPPLER_CONFIG="dev" ;;
    prod) DOPPLER_CONFIG="prd" ;;
    *)    DOPPLER_CONFIG="prd" ;;
esac

# Compose files (set after generate_infra creates them)
COMPOSE_FILE="$DEPLOY_DIR/docker-compose.registry.yml"
CADDY_COMPOSE_FILE="$DEPLOY_DIR/docker-compose.caddy.yml"
ENV_FILE="$DEPLOY_DIR/.env.${ENV_NAME}.generated"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# =============================================================================
# Compose Helpers
# =============================================================================

dc() { docker compose -p shady -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }
dc_caddy() { docker compose -p shady-caddy -f "$CADDY_COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

# =============================================================================
# Initialization
# =============================================================================

check_env() {
    for var in IMAGE_TAG REGISTRY REPO_OWNER; do
        if [ -z "${!var:-}" ]; then
            log_error "$var is not set"
            exit 1
        fi
    done
    export IMAGE_TAG REGISTRY REPO_OWNER
    log_info "Deploying with IMAGE_TAG=$IMAGE_TAG"
}

check_runtime_env() {
    for var in BACKEND_PORT ADMIN_PORT WIDGET_PORT; do
        if [ -z "${!var:-}" ]; then
            log_error "Missing required env var: $var"
            exit 1
        fi
    done
}

check_first_run() {
    if [[ ! -d "$INSTALL_DIR/.git" ]]; then
        log_info "=== First deployment detected - initializing ==="

        command -v docker  >/dev/null 2>&1 || { apt-get update && apt-get install -y docker.io docker-compose-plugin && systemctl enable --now docker; }
        command -v python3 >/dev/null 2>&1 || { apt-get update && apt-get install -y python3; }
        command -v jq      >/dev/null 2>&1 || { apt-get update && apt-get install -y jq; }
        command -v doppler >/dev/null 2>&1 || { curl -Ls https://cli.doppler.com/install.sh | sh; }

        export FIRST_RUN=true
        log_info "First deployment initialization complete"
    else
        export FIRST_RUN=false
    fi
}

generate_infra() {
    if [ ! -f "$INFRA_DIR/scripts/generate.py" ]; then
        log_error "Infra generator not found: $INFRA_DIR/scripts/generate.py"
        exit 1
    fi

    log_info "Generating infra config for SHADY_ENV=$ENV_NAME..."
    python3 "$INFRA_DIR/scripts/generate.py" "$ENV_NAME"

    # Verify generated files exist
    for f in "$ENV_FILE" "$COMPOSE_FILE"; do
        if [ ! -f "$f" ]; then
            log_error "Generated file not found: $f"
            exit 1
        fi
    done
}

load_env() {
    # Accept Doppler token from environment (set by deploy-agent.sh)
    if [ -z "${DOPPLER_TOKEN:-}" ]; then
        if [ -f "/etc/shady/deploy.conf" ]; then
            log_info "Loading Doppler configuration from /etc/shady/deploy.conf..."
            # shellcheck disable=SC1091
            source /etc/shady/deploy.conf
        fi
    else
        log_info "Using DOPPLER_TOKEN from environment"
    fi

    if [ -z "${DOPPLER_TOKEN:-}" ]; then
        log_error "DOPPLER_TOKEN not set. Run: shady-deploy setup <env> <doppler-token>"
        exit 1
    fi

    log_info "Fetching secrets from Doppler ($DOPPLER_PROJECT/$DOPPLER_CONFIG)..."
    if ! doppler secrets --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token "$DOPPLER_TOKEN" >/dev/null 2>&1; then
        log_error "Failed to access Doppler secrets. Check token permissions."
        exit 1
    fi

    set -a
    eval "$(doppler secrets download --project "$DOPPLER_PROJECT" --config "$DOPPLER_CONFIG" --token "$DOPPLER_TOKEN" --format env --no-file 2>/dev/null)"
    # shellcheck disable=SC1090
    . "$ENV_FILE"
    set +a

    export DOPPLER_TOKEN DOPPLER_PROJECT DOPPLER_CONFIG
    log_info "Secrets loaded from Doppler"
}

# =============================================================================
# Deployment Steps
# =============================================================================

pull_images() {
    log_info "Pulling latest images..."
    dc pull
}

start_infrastructure() {
    log_info "Starting infrastructure services..."

    # Database
    dc up -d --remove-orphans shady-db
    log_info "Waiting for database to be healthy..."
    local attempt=1
    while [ $attempt -le 10 ]; do
        if dc exec -T shady-db pg_isready -U "$POSTGRES_USER" > /dev/null 2>&1; then
            log_info "Database is healthy"
            break
        fi
        [ $attempt -eq 10 ] && { log_error "Database failed to start"; dc logs shady-db; exit 1; }
        log_warn "Database not ready, attempt $attempt/10..."
        sleep 2
        ((attempt++))
    done
}

migrate_database() {
    log_info "Migrating database schema..."

    local DB_USER=${POSTGRES_USER}
    local DB_NAME=${POSTGRES_DB}

    log_info "Ensuring required PostgreSQL extensions..."
    dc exec -T shady-db psql -U "$DB_USER" -d "$DB_NAME" \
        -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"; CREATE EXTENSION IF NOT EXISTS \"vector\";" || exit 1

    log_info "Pushing schema from Drizzle (non-interactive)..."
    set +e
    printf '\n' | timeout 600 docker compose -p shady -f "$COMPOSE_FILE" --env-file "$ENV_FILE" \
        run --rm -T shady-backend sh -c "cd /app && bunx drizzle-kit push --force"
    local status=$?
    set -e

    if [ "$status" -ne 0 ]; then
        if [ "$status" -eq 124 ]; then
            log_error "Drizzle schema push timed out after 10 minutes"
        else
            log_error "Drizzle schema push failed with exit code $status"
        fi
        exit 1
    fi

    log_info "Database schema migration complete"
}

deploy_services() {
    log_info "Deploying application services..."

    dc up -d --remove-orphans shady-backend shady-admin shady-widget

    log_info "Waiting for services to stabilize..."
    sleep 5
}

health_check() {
    log_info "Running health checks..."

    # Backend
    local attempt=1
    while [ $attempt -le 10 ]; do
        if curl -fsS "http://127.0.0.1:${BACKEND_PORT}/health" > /dev/null 2>&1; then
            log_info "Backend is healthy"
            break
        fi
        [ $attempt -eq 10 ] && { log_error "Backend health check failed"; dc logs --tail=50 shady-backend; exit 1; }
        log_warn "Backend not ready, attempt $attempt/10..."
        sleep 2
        ((attempt++))
    done

    # Admin
    attempt=1
    while [ $attempt -le 10 ]; do
        if curl -fsS "http://127.0.0.1:${ADMIN_PORT}" > /dev/null 2>&1; then
            log_info "Admin is healthy"
            break
        fi
        [ $attempt -eq 10 ] && log_warn "Admin health check failed (may be slow to start)"
        sleep 2
        ((attempt++))
    done
}

deploy_edge_services() {
    log_info "Checking Caddy..."

    if docker compose -p shady-caddy -f "$CADDY_COMPOSE_FILE" ps --quiet caddy 2>/dev/null | grep -q .; then
        log_info "Caddy is running, updating..."
        dc_caddy pull 2>/dev/null || true
        dc_caddy up -d --remove-orphans
        docker exec shady-caddy caddy reload --config /etc/caddy/Caddyfile 2>/dev/null && log_info "Caddy config reloaded" || log_warn "Caddy reload failed"
    else
        log_info "Starting Caddy..."
        dc_caddy up -d --remove-orphans
    fi
}

cleanup() {
    log_info "Cleaning up old images..."
    docker image prune -f --filter "until=24h" || true
}

show_status() {
    log_info "Deployment complete!"
    echo ""
    echo "Service Status:"
    dc ps
    echo ""
    log_info "Deployed IMAGE_TAG=$IMAGE_TAG to $(hostname)"
    log_info "Secrets loaded from Doppler ($DOPPLER_PROJECT/$DOPPLER_CONFIG)"
}

# =============================================================================
# Entrypoint
# =============================================================================

main() {
    log_info "Starting deployment..."

    check_first_run
    check_env
    generate_infra
    load_env
    check_runtime_env

    deploy_edge_services
    pull_images
    start_infrastructure
    migrate_database
    deploy_services
    health_check
    cleanup
    show_status

    systemctl restart shady-deploy-webhook 2>/dev/null || true
}

case "${1:-deploy}" in
    deploy) main ;;
    *)      log_error "Unknown command: $1 (use: deploy)"; exit 1 ;;
esac
