# =============================================================================
# Booking Service Development Makefile
# =============================================================================

COMPOSE = docker compose -p shady --env-file .env.dev --env-file .env.dev.generated -f docker-compose.yml
SERVICES = postgres backend admin widget-dev widget-embed
INFRA_GENERATOR = infra/scripts/generate.py
ENV_GENERATED = .env.dev.generated

.DEFAULT_GOAL := help

# =============================================================================
# Infra Config Generation
# =============================================================================
.PHONY: infra
infra: $(ENV_GENERATED)

$(ENV_GENERATED): infra/ports.json infra/env.nonsecret.json $(INFRA_GENERATOR)
	@python3 $(INFRA_GENERATOR) dev

# =============================================================================
# Help
# =============================================================================
.PHONY: help
help:
	@echo "=== Booking Service Development Commands ==="
	@echo ""
	@echo "Quick Start:"
	@echo "  up                 Start all services"
	@echo "  down               Stop all services"
	@echo "  logs               Tail logs (SERVICE=name to filter)"
	@echo "  ps                 Show service status"
	@echo ""
	@echo "Database:"
	@echo "  db-shell           Open psql shell"
	@echo "  db-studio          Launch Drizzle Studio"
	@echo "  db-migrate         Generate and push migrations"
	@echo "  infra              Regenerate local env from shady/infra/*"
	@echo ""
	@echo "Logto:"
	@echo "  logto-setup        Configure Logto (API resource + SPA apps)"
	@echo ""
	@echo "Secrets:"
	@echo "  doppler-sync       Download shady/dev secrets to .env.dev"
	@echo "  doppler-status     Check local Doppler authentication"
	@echo ""
	@echo "Services (start/stop/logs/rebuild):"
	@echo "  <service>          $(SERVICES)"
	@echo "  <service>-logs     Example: make backend-logs"
	@echo "  <service>-rebuild  Example: make backend-rebuild"
	@echo "  <service>-stop     Example: make backend-stop"
	@echo ""
	@echo "Utilities:"
	@echo "  build              Build all Docker images"
	@echo "  clean              Full cleanup (all volumes & data)"
	@echo ""

# =============================================================================
# Stack Control
# =============================================================================
.PHONY: up down logs ps build clean
up: infra
	$(COMPOSE) up -d --build
	@echo "✅ Stack running:"
	@echo "   Backend:  http://localhost:5006"
	@echo "   Admin:    http://localhost:5175"
	@echo "   Widget demo:   http://localhost:5174"
	@echo "   Widget embed:  http://localhost:5178/widget.js"

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f $${SERVICE}

ps:
	$(COMPOSE) ps

build: infra
	$(COMPOSE) build

clean:
	@echo "⚠️  This will delete ALL containers and volumes"
	@read -p "Continue? (yes/no): " c && [ "$$c" = "yes" ] || exit 1
	$(COMPOSE) down -v

# =============================================================================
# Database Management
# =============================================================================
.PHONY: db-shell db-studio db-migrate
db-shell:
	$(COMPOSE) exec postgres psql -U booking_user -d booking_service

db-studio: infra
	$(COMPOSE) up -d drizzle-studio
	@echo "🎨 Drizzle Studio: https://local.drizzle.studio?port=4985&host=localhost"

db-migrate: infra
	@echo "Pushing schema in the backend container..."
	@$(COMPOSE) run --rm backend bunx drizzle-kit push --force
	@echo "✅ Schema applied"

# =============================================================================
# Logto Management
# =============================================================================
.PHONY: logto-setup doppler-sync doppler-status
logto-setup:
	@echo "⚙️  Configuring shared Logto for AICO + Shady..."
	@$(MAKE) -C .. auth-setup

doppler-sync:
	@./scripts/setup_doppler.sh --sync-only

doppler-status:
	@if command -v doppler >/dev/null 2>&1; then \
		if doppler whoami >/dev/null 2>&1; then \
			echo "Authenticated"; \
			doppler whoami 2>/dev/null || true; \
		else \
			echo "Not authenticated"; \
			echo "  Run: doppler login"; \
			exit 1; \
		fi \
	else \
		echo "Doppler CLI not installed"; \
		exit 1; \
	fi

# =============================================================================
# Service-Specific Targets (auto-generated for each service)
# =============================================================================
define SERVICE_TEMPLATE
.PHONY: $(1) $(1)-logs $(1)-rebuild $(1)-stop
$(1): infra
	$$(COMPOSE) up -d $(1)

$(1)-logs:
	$$(COMPOSE) logs -f $(1)

$(1)-rebuild: infra
	$$(COMPOSE) up -d --build $(1)

$(1)-stop:
	$$(COMPOSE) stop $(1)
endef
$(foreach service,$(SERVICES),$(eval $(call SERVICE_TEMPLATE,$(service))))
