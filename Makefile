# =============================================================================
# KMITL AI Workspace – convenience targets
# =============================================================================
# One command from a clean checkout:
#   make up        # brings up the entire stack (build + start)
# =============================================================================

COMPOSE       ?= docker compose
COMPOSE_FILE  ?= -f docker-compose.yml
ENV_FILE      ?= .env
PROJECT_NAME  ?= kmitlai
COMPOSE       += -p $(PROJECT_NAME)

.PHONY: help up up-dev down logs build rebuild restart ps clean nuke env-check

help:  ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "Targets:\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)

env-check:  ## Verify .env exists (copy from .env.example if missing)
	@if [ ! -f $(ENV_FILE) ]; then \
		echo "✗ Missing $(ENV_FILE). Copying from .env.example..."; \
		cp .env.example $(ENV_FILE); \
		echo "  ✓ Created $(ENV_FILE). Edit it to set OPEN_NOTEBOOK_ENCRYPTION_KEY and API keys."; \
	else \
		echo "✓ $(ENV_FILE) exists."; \
	fi

up: env-check  ## Build images and start the entire stack in detached mode
	$(COMPOSE) $(COMPOSE_FILE) --env-file $(ENV_FILE) up -d --build
	@echo ""
	@echo "Stack is up. Open http://localhost (browser will prompt for admin / 123)"
	@echo "  - http://localhost/           Open Notebook (Next.js)"
	@echo "  - http://localhost/quiz/      My AI Quiz"
	@echo "  - http://localhost/roadmap/  AI Roadmap Generator"
	@echo "  - http://localhost/api/docs  FastAPI docs"
	@echo "  - http://localhost/pb/_/      PocketBase admin"

up-dev: env-check  ## Start development stack with hot reload (frontend + backend)
	$(COMPOSE) -f docker-compose-dev.yml -p kmitlai_dev --env-file $(ENV_FILE) up
	@echo ""
	@echo "Development stack is up with hot reload!"
	@echo "  - Frontend: http://localhost:3000 (hot reload)"
	@echo "  - API: http://localhost:5055 (auto-reload)"
	@echo "  - API Docs: http://localhost:5055/docs"

build: env-check  ## Build all images without starting
	$(COMPOSE) $(COMPOSE_FILE) --env-file $(ENV_FILE) build

rebuild: env-check  ## Rebuild without cache
	$(COMPOSE) $(COMPOSE_FILE) --env-file $(ENV_FILE) build --no-cache

down:  ## Stop the stack (keeps volumes)
	$(COMPOSE) $(COMPOSE_FILE) down

down-dev:  ## Stop development stack
	$(COMPOSE) -f docker-compose-dev.yml -p kmitlai_dev down

restart:  ## Restart the stack
	$(COMPOSE) $(COMPOSE_FILE) restart

logs:  ## Tail logs from every service
	$(COMPOSE) $(COMPOSE_FILE) logs -f

ps:  ## List running services
	$(COMPOSE) $(COMPOSE_FILE) ps

clean: down  ## Stop and remove containers + networks (keeps volumes)
	$(COMPOSE) $(COMPOSE_FILE) down --remove-orphans

nuke: down  ## Stop + remove everything including volumes (DESTROYS DATA)
	$(COMPOSE) $(COMPOSE_FILE) down --remove-orphans --volumes
	@echo "✗ All volumes removed. The next `make up` will start from scratch."