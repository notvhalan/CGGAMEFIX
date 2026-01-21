.PHONY: help setup dev build test clean docker-up docker-down logs

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install dependencies and start infrastructure
	pnpm install
	$(MAKE) docker-up

dev: ## Start all services in development mode
	pnpm run dev

dev-gateway: ## Start only API Gateway
	pnpm run dev:gateway

dev-engine: ## Start only Matching Engine
	pnpm run dev:engine

build: ## Build all services
	pnpm run build

test: ## Run all tests
	pnpm run test

lint: ## Run linter
	pnpm run lint

lint-fix: ## Fix linting issues
	pnpm run lint:fix

format: ## Format code with Prettier
	pnpm run format

typecheck: ## Type check all packages
	pnpm run typecheck

clean: ## Clean all build artifacts and dependencies
	pnpm run clean

docker-up: ## Start Docker infrastructure (Postgres, Redis, NATS)
	docker-compose up -d

docker-down: ## Stop Docker infrastructure
	docker-compose down

docker-clean: ## Remove all Docker volumes and networks
	docker-compose down -v

logs: ## Show Docker logs
	docker-compose logs -f

db-migrate: ## Run database migrations
	@echo "TODO: Add migration runner"

db-seed: ## Seed database with test data
	@echo "TODO: Add seed script"
