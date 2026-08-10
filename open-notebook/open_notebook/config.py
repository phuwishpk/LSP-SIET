import os

# ROOT DATA FOLDER
DATA_FOLDER = "./data"

# LANGGRAPH CHECKPOINT FILE
sqlite_folder = f"{DATA_FOLDER}/sqlite-db"
os.makedirs(sqlite_folder, exist_ok=True)
LANGGRAPH_CHECKPOINT_FILE = f"{sqlite_folder}/checkpoints.sqlite"

# UPLOADS FOLDER
UPLOADS_FOLDER = f"{DATA_FOLDER}/uploads"
os.makedirs(UPLOADS_FOLDER, exist_ok=True)

# TIKTOKEN CACHE FOLDER
# Reads TIKTOKEN_CACHE_DIR from the environment so Docker can redirect the cache
# to a path outside /data/ (which is typically volume-mounted and would hide the
# pre-baked encoding baked into the image at build time).
TIKTOKEN_CACHE_DIR = os.environ.get("TIKTOKEN_CACHE_DIR", "").strip() or f"{DATA_FOLDER}/tiktoken-cache"
os.makedirs(TIKTOKEN_CACHE_DIR, exist_ok=True)

# REDIS CACHE SETTINGS
# Redis URL for the caching layer. If not set, cache operations will be skipped.
REDIS_URL = os.environ.get("REDIS_URL", "").strip() or ""
# Default TTL for cache entries (in seconds). Per-type TTLs override this.
DEFAULT_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_CACHE_TTL", "3600"))
# Vector search cache TTL (30 minutes)
VECTOR_SEARCH_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_VECTOR_SEARCH_CACHE_TTL", "1800"))
# Context build cache TTL (15 minutes)
CONTEXT_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_CONTEXT_CACHE_TTL", "900"))
# Embedding cache TTL (2 hours)
EMBEDDING_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_EMBEDDING_CACHE_TTL", "7200"))
# Notebook metadata cache TTL (10 minutes)
NOTEBOOK_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_NOTEBOOK_CACHE_TTL", "600"))
# Provider availability cache TTL (5 minutes)
PROVIDER_CACHE_TTL = int(os.environ.get("OPEN_NOTEBOOK_PROVIDER_CACHE_TTL", "300"))

# Phase 4 answer-cache intent validation. Mid-band semantic candidates are
# reused only after a tiny language-model validation call succeeds.
ANSWER_CACHE_INTENT_VALIDATOR_ENABLED = os.environ.get(
    "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_VALIDATION", "1"
).strip().lower() in {"1", "true", "yes", "on"}
ANSWER_CACHE_INTENT_TIMEOUT_MS = int(
    os.environ.get("OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_TIMEOUT_MS", "1500")
)
ANSWER_CACHE_INTENT_MIN_SIMILARITY = float(
    os.environ.get("OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_MIN_SIM", "0.92")
)
