# Liturgy Turner - Docker Quick Commands

.PHONY: help setup start stop logs status clean rebuild shell-app shell-agent backup restore

help: ## Show this help
	@echo "Liturgy Turner Docker Commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

setup: ## Initial setup (copy configs)
	@if [ ! -f .env ]; then \
		cp .env.docker .env; \
		echo "✅ Created .env file. Please edit with your credentials."; \
	else \
		echo "⚠️  .env already exists."; \
	fi
	@if [ ! -f agent/clawdbot.json5 ]; then \
		cp agent/clawdbot.json5.example agent/clawdbot.json5; \
		echo "✅ Created agent/clawdbot.json5"; \
	else \
		echo "⚠️  agent/clawdbot.json5 already exists."; \
	fi

start: ## Start all services
	docker-compose up -d

stop: ## Stop all services
	docker-compose down

logs: ## Follow logs from all services
	docker-compose logs -f

logs-app: ## Follow app logs only
	docker-compose logs -f app

logs-agent: ## Follow agent logs only
	docker-compose logs -f agent

logs-db: ## Follow database logs only
	docker-compose logs -f postgres

status: ## Show running containers
	docker-compose ps

clean: ## Stop and remove all containers, networks, volumes
	docker-compose down -v
	@echo "⚠️  Warning: All data has been removed!"

rebuild: ## Rebuild all images and restart
	docker-compose build --no-cache
	docker-compose up -d

rebuild-app: ## Rebuild only app image
	docker-compose build --no-cache app
	docker-compose up -d app

rebuild-agent: ## Rebuild only agent image
	docker-compose build --no-cache agent
	docker-compose up -d agent

shell-app: ## Open shell in app container
	docker-compose exec app bash

shell-agent: ## Open shell in agent container
	docker-compose exec agent bash

shell-db: ## Open PostgreSQL CLI
	docker-compose exec postgres psql -U liturgy_user -d liturgy_turner

backup: ## Backup database to backup.sql
	docker-compose exec postgres pg_dump -U liturgy_user liturgy_turner > backup.sql
	@echo "✅ Database backed up to backup.sql"

restore: ## Restore database from backup.sql
	@if [ ! -f backup.sql ]; then \
		echo "❌ backup.sql not found"; \
		exit 1; \
	fi
	cat backup.sql | docker-compose exec -T postgres psql -U liturgy_user -d liturgy_turner
	@echo "✅ Database restored from backup.sql"

migrate: ## Run database migrations
	docker-compose exec app npm run db:push

restart-app: ## Restart app service
	docker-compose restart app

restart-agent: ## Restart agent service
	docker-compose restart agent

restart-db: ## Restart database service
	docker-compose restart postgres

agent-status: ## Check Clawdbot agent status
	docker-compose exec agent clawdbot status || echo "Agent not responding"
