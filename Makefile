.PHONY: help up down restart logs db-shell db-studio db-migrate backend-dev backend-start backend-logs backend-shell admin-dev admin-logs widget-dev widget-logs dev logto-setup clean install setup

# Default target
help:
	@echo "=========================================="
	@echo "Booking Service - Makefile Commands"
	@echo "=========================================="
	@echo ""
	@echo "Quick Start:"
	@echo "  make dev             - Start all services in dev mode (postgres + backend + admin + widget)"
	@echo "  make up              - Start infrastructure only (postgres)"
	@echo "  make down            - Stop all services"
	@echo "  make restart         - Restart all services"
	@echo "  make setup           - Full setup from scratch (install deps + init DB)"
	@echo ""
	@echo "Database:"
	@echo "  make db-shell        - Open psql shell"
	@echo "  make db-studio       - Launch Drizzle Studio"
	@echo "  make db-migrate      - Generate and push migrations"
	@echo "  make db-reset        - Drop and recreate database"
	@echo ""
	@echo "Backend:"
	@echo "  make backend-dev     - Start backend in development mode (blocking)"
	@echo "  make backend-logs    - Tail backend logs"
	@echo "  make backend-shell   - Open shell in backend"
	@echo ""
	@echo "Frontend:"
	@echo "  make admin-dev       - Start admin UI in development mode (blocking)"
	@echo "  make admin-logs      - Tail admin UI logs"
	@echo "  make widget-dev      - Start widget in development mode (blocking)"
	@echo "  make widget-logs     - Tail widget logs"
	@echo ""
	@echo "Logto:"
	@echo "  make logto-setup     - Configure Logto (API resource + SPA apps)"
	@echo ""
	@echo "Utilities:"
	@echo "  make logs            - Show all logs"
	@echo "  make clean           - Clean up everything (containers, volumes)"
	@echo "  make install         - Install all dependencies"
	@echo ""

# Start infrastructure only
up:
	@echo "Starting Postgres..."
	docker-compose up -d postgres
	@sleep 3
	@echo "✓ Postgres ready on port 5436"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Run migrations: make db-migrate"
	@echo "  2. Start backend: make backend-dev"
	@echo "  3. Start admin UI: make admin-dev"
	@echo "  4. Or start all: make dev"

# Start all services in dev mode
dev:
	@echo "Starting all services in development mode..."
	@mkdir -p logs
	@echo ""
	@echo "1/4 Starting Postgres..."
	@docker-compose up -d postgres
	@sleep 3
	@echo "✓ Postgres ready on port 5436"
	@echo ""
	@echo "2/4 Starting backend..."
	@docker-compose up -d backend
	@echo "✓ Backend starting on port 5006 (logs: make backend-logs)"
	@echo ""
	@echo "3/4 Starting admin UI..."
	@docker-compose up -d admin
	@echo "✓ Admin UI starting on port 5175 (logs: make admin-logs)"
	@echo ""
	@echo "4/4 Starting widget..."
	@docker-compose up -d widget-dev
	@echo "✓ Widget starting on port 5174 (logs: make widget-logs)"
	@echo ""
	@echo "=========================================="
	@echo "✓ All services started!"
	@echo "=========================================="
	@echo ""
	@echo "URLs:"
	@echo "  Backend:  http://localhost:5006"
	@echo "  Admin UI: http://localhost:5175"
	@echo "  Widget:   http://localhost:5174"
	@echo ""
	@echo "Commands:"
	@echo "  make logs         - Show all logs"
	@echo "  make backend-logs - Show backend logs"
	@echo "  make admin-logs   - Show admin UI logs"
	@echo "  make widget-logs  - Show widget logs"
	@echo "  make down         - Stop all services"
	@echo ""

# Stop all services
down:
	@echo "Stopping services..."
	@docker-compose down
	@echo "✓ All services stopped"

# Restart all services
restart: down dev

# Show all logs (aggregated)
logs:
	@mkdir -p logs
	@echo "Aggregating logs from all services..."
	@tail -f logs/*.log 2>/dev/null || echo "No logs available yet"

# Backend logs
backend-logs:
	@docker-compose logs -f backend

# Admin UI logs
admin-logs:
	@docker-compose logs -f admin

# Widget logs
widget-logs:
	@docker-compose logs -f widget-dev

# Database shell
db-shell:
	docker-compose exec postgres psql -U booking_user -d booking_service

# Drizzle Studio
db-studio:
	docker-compose up -d drizzle-studio
	@echo "🎨 Drizzle Studio: https://local.drizzle.studio?port=4985&host=localhost"

# Database migrations
db-migrate:
	@echo "Generating migrations..."
	@cd backend && bun run db:generate
	@echo ""
	@echo "Pushing schema to database..."
	@cd backend && bunx drizzle-kit push
	@echo "✓ Migrations applied"

# Reset database
db-reset:
	@echo "WARNING: This will delete all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker-compose up -d postgres; \
		sleep 3; \
		cd backend && bunx drizzle-kit push; \
		echo "✓ Database reset complete"; \
	else \
		echo "Cancelled"; \
	fi

# Development mode (blocking - for active development)
backend-dev:
	@docker-compose up backend

# Start backend in background
backend-start:
	@docker-compose up -d backend
	@echo "Backend started in background"
	@echo "View logs: make backend-logs"

# Backend shell
backend-shell:
	@docker-compose exec backend bun repl

# Admin UI development mode (blocking)
admin-dev:
	@docker-compose up admin

# Widget development mode (blocking)
widget-dev:
	@docker-compose up widget-dev

# Logto setup
logto-setup:
	@echo "Setting up Logto for Booking Service..."
	@node scripts/logto-booking-setup.js

# Clean everything
clean:
	@echo "Cleaning up..."
	@docker-compose down -v
	@rm -rf logs/*
	@rm -rf backend/node_modules
	@rm -rf admin/node_modules
	@rm -rf widget/node_modules
	@rm -rf backend/drizzle
	@echo "✓ Cleanup complete"

# Install dependencies
install:
	@echo "Installing dependencies for all services..."
	@echo "1/3 Backend..."
	@cd backend && bun install
	@echo "2/3 Admin UI..."
	@cd admin && bun install
	@echo "3/3 Widget..."
	@cd widget && bun install
	@echo "✓ All dependencies installed"

# Full setup from scratch
setup: install
	@echo "Setting up Booking Service..."
	docker-compose up -d postgres
	@sleep 3
	@cd backend && bunx drizzle-kit push
	@echo ""
	@echo "✓ Setup complete!"
	@echo ""
	@echo "Next steps:"
	@echo "  1. Start backend: make backend-start"
	@echo "  2. Test API: make test-api"
