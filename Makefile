# =============================================================================
# Booking Service Development Makefile
# =============================================================================

COMPOSE = docker compose -f docker-compose.yml
SERVICES = postgres backend admin widget-dev

.DEFAULT_GOAL := help

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
	@echo ""
	@echo "Logto:"
	@echo "  logto-setup        Configure Logto (API resource + SPA apps)"
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
up:
	$(COMPOSE) up -d --build
	@echo "✅ Stack running:"
	@echo "   Backend:  http://localhost:5006"
	@echo "   Admin:    http://localhost:5175"
	@echo "   Widget:   http://localhost:5174"

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f $${SERVICE}

ps:
	$(COMPOSE) ps

build:
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

db-studio:
	$(COMPOSE) up -d drizzle-studio
	@echo "🎨 Drizzle Studio: https://local.drizzle.studio?port=4985&host=localhost"

db-migrate:
	@echo "Generating and pushing migrations..."
	@cd backend && bunx drizzle-kit push
	@echo "✅ Migrations applied"

# =============================================================================
# Logto Management
# =============================================================================
.PHONY: logto-setup
logto-setup:
	@echo "⚙️  Configuring Logto for Booking Service..."
	@node scripts/logto-booking-setup.js

# =============================================================================
# Service-Specific Targets (auto-generated for each service)
# =============================================================================
define SERVICE_TEMPLATE
.PHONY: $(1) $(1)-logs $(1)-rebuild $(1)-stop
$(1):
	$$(COMPOSE) up -d $(1)

$(1)-logs:
	$$(COMPOSE) logs -f $(1)

$(1)-rebuild:
	$$(COMPOSE) up -d --build $(1)

$(1)-stop:
	$$(COMPOSE) stop $(1)
endef
$(foreach service,$(SERVICES),$(eval $(call SERVICE_TEMPLATE,$(service))))
