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

.PHONY: help up up-dev down logs build rebuild restart ps clean nuke env-check test-backend test-frontend frontend-links migrate-split

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
# Backend tests of open-notebook and the SIET packages, run with open-notebook's
# virtualenv (the packages are installed into it as editable path dependencies).
# .env loading is off: api/main.py calls load_dotenv(), which finds this repo's
# root .env, and whether a test then sees JWT_SECRET depends on test order.
PYTEST ?= uv run --no-sync python -m pytest
SIET_TEST_DIRS = tests ../siet-platform/tests ../kmitl-rag/tests ../community/tests

test-backend:  ## Run backend tests (open-notebook + siet-platform + kmitl-rag + community)
	cd open-notebook && PYTHON_DOTENV_DISABLED=1 $(PYTEST) -q $(SIET_TEST_DIRS) $(ARGS)

# One-time move of the KMITL SurrealDB migration records (core 19-25) to the
# SIET track (_siet_migrations, k2-k8). Needs the image built from this branch.
# Prod and dev share open-notebook/surreal_data, so run it once, on either stack.
ifeq ($(STACK),dev)
SPLIT_COMPOSE = $(COMPOSE_BASE) -f docker-compose-dev.yml -p kmitlai_dev --env-file $(ENV_FILE)
SPLIT_DB = kmitlai_dev_surrealdb
SPLIT_API = kmitlai_dev_open_notebook_api
else
SPLIT_COMPOSE = $(COMPOSE) $(COMPOSE_FILE) --env-file $(ENV_FILE)
SPLIT_DB = surrealdb
SPLIT_API = open_notebook_api
endif
COMPOSE_BASE ?= docker compose
BACKUP_DIR = backups/surreal_data-$(shell date +%Y%m%d-%H%M%S)

migrate-split:  ## One-time: move KMITL migration records to the SIET track (CONFIRM=1, STACK=dev for dev)
	@if [ -z "$(CONFIRM)" ]; then \
		echo "Stops SurrealDB and the API, copies open-notebook/surreal_data to $(BACKUP_DIR),"; \
		echo "then moves the migration records. Run again with CONFIRM=1. See docs/UPSTREAM.md section 5."; \
		exit 1; \
	fi
	$(SPLIT_COMPOSE) stop $(SPLIT_API) $(SPLIT_DB)
	mkdir -p backups && cp -a open-notebook/surreal_data $(BACKUP_DIR)
	$(SPLIT_COMPOSE) up -d $(SPLIT_DB)
	$(SPLIT_COMPOSE) run --rm --no-deps $(SPLIT_API) /app/.venv/bin/python -m siet_platform.migrations.split --dry-run
	$(SPLIT_COMPOSE) run --rm --no-deps $(SPLIT_API) /app/.venv/bin/python -m siet_platform.migrations.split --backup-done
	@echo "Backup: $(BACKUP_DIR). Start the stack again (make up / make up-dev)."

# The SIET frontend packages (siet-platform/frontend, kmitl-rag/frontend,
# community/frontend) are compiled into open-notebook's Next.js app and resolve
# react & co. through its node_modules, via a symlink in each package.
SIET_FRONTENDS = siet-platform kmitl-rag community

frontend-links:  ## Link each SIET frontend package to open-notebook/frontend/node_modules
	@for d in $(SIET_FRONTENDS); do ln -sfn ../../open-notebook/frontend/node_modules $$d/frontend/node_modules; done
	@echo "linked: $(SIET_FRONTENDS)"

test-frontend: frontend-links  ## Typecheck and run frontend tests (open-notebook + SIET packages)
	cd open-notebook/frontend && npx tsc --noEmit -p . && npx vitest run $(ARGS)
