# Cache Module

Redis-based caching layer for expensive operations in Open Notebook.

## Overview

The cache module provides a high-performance caching layer using Redis to reduce:
- Repeated SurrealDB queries for the same data
- Expensive embedding generation for unchanged content
- Vector search computation for repeated queries

## Architecture

```
Application Code
       │
       ▼
CacheService (domain-specific operations)
       │
       ▼
RedisClient (async Redis wrapper)
       │
       ▼
   Redis 7 (Alpine)
```

### Key Design Principles

1. **Graceful Degradation**: If Redis is unavailable, all operations silently bypass the cache without errors
2. **Lazy Connection**: Redis client connects only on first use (not at startup)
3. **TTL-based Expiry**: All cache entries have sensible TTLs; Redis LRU evicts when memory is full
4. **Per-domain Keys**: Cache keys are namespaced by domain (`search:`, `context:`, `embed:`, etc.)

## Cache Key Patterns

| Pattern | TTL | Invalidation | Purpose |
|---|---|---|---|
| `search:vector:global:{hash}` | 30 min | Manual | Global vector search results |
| `context:{notebook_id}:{hash}` | 15 min | `invalidate_context(nb_id)` | Notebook context builds |
| `embed:{source_id}:{idx}` | 2 hrs | `invalidate_embedding(src_id)` | Embedding vectors |
| `notebook:{id}:meta` | 10 min | `invalidate_notebook(nb_id)` | Notebook metadata |
| `models:providers:availability` | 5 min | `invalidate_provider_cache()` | Provider status |

## Configuration

Environment variables (see `open_notebook/config.py`):

- `REDIS_URL` — Redis connection URL (default: empty = cache disabled)
- `OPEN_NOTEBOOK_CACHE_TTL` — Default TTL in seconds (default: 3600)
- `OPEN_NOTEBOOK_VECTOR_SEARCH_CACHE_TTL` — Vector search cache TTL (default: 1800)
- `OPEN_NOTEBOOK_CONTEXT_CACHE_TTL` — Context cache TTL (default: 900)
- `OPEN_NOTEBOOK_EMBEDDING_CACHE_TTL` — Embedding cache TTL (default: 7200)
- `OPEN_NOTEBOOK_NOTEBOOK_CACHE_TTL` — Notebook metadata TTL (default: 600)
- `OPEN_NOTEBOOK_PROVIDER_CACHE_TTL` — Provider availability TTL (default: 300)

## Component Catalog

### redis_client.py
- **RedisClient**: Singleton async Redis wrapper
  - `is_configured` / `is_available()` — Check Redis availability
  - `get_json(key)` / `set_json(key, value, ttl)` — JSON serialization
  - `get_binary(key)` / `set_binary(key, value, ttl)` — Raw bytes
  - `get_embedding(key)` / `set_embedding(key, embedding, ttl)` — Optimized float vector storage (base64 + struct packing)
  - `delete(key)` / `delete_pattern(pattern)` / `invalidate_prefix(prefix)` — Invalidation
  - `health_check()` — Memory/connection status for monitoring

### service.py
- **CacheService**: High-level domain-specific caching
  - Vector search: `get_vector_search_results()`, `set_vector_search_results()`, `invalidate_vector_search()`
  - Context: `get_context()`, `set_context()`, `invalidate_context()`
  - Embeddings: `get_embedding()`, `set_embedding()`, `get_embeddings_batch()`, `set_embeddings_batch()`, `invalidate_embedding()`
  - Notebook: `get_notebook_meta()`, `set_notebook_meta()`, `invalidate_notebook()`
  - Provider: `get_provider_availability()`, `set_provider_availability()`, `invalidate_provider_cache()`
  - Generic: `get_json()`, `set_json()`, `delete()`, `invalidate_prefix()`

### invalidation.py
Decorators and helpers for cache invalidation on data changes:

- `@invalidate_on_change(notebook_id_param)` — Decorator: invalidate notebook cache after function
- `@invalidate_source_cache(source_id_param)` — Decorator: invalidate embeddings + affected notebooks
- `@invalidate_notebook_cache(notebook_id_param)` — Decorator: invalidate all notebook-related cache
- `invalidate_after_source_delete(source_id)` — Explicit call after source deletion
- `invalidate_after_note_change(notebook_id)` — Explicit call after note CRUD
- `invalidate_after_insight_change(notebook_id)` — Explicit call after insight CRUD
- `invalidate_after_model_change()` — Explicit call after model/credential changes

### metrics.py
- **CacheMetrics**: Thread-safe metrics tracking
  - `record_hit()`, `record_miss()`, `record_set()`, `record_invalidation()`, `record_error()`
  - `hit_rate` — Computed property
  - `get_summary()` — Dict with all stats + per-prefix breakdown
  - `reset()` — Clear all counters

## Integration Points

### Vector Search (`domain/notebook.py`)
- `vector_search()` checks cache before embedding + DB query
- Cache key = hash of search parameters

### Context Builder (`utils/context_builder.py`)
- `ContextBuilder.build()` checks cache before fetching sources/notes
- Cache key = hash of `ContextConfig.to_cache_key()`
- Reconstructs `ContextItem` objects from cached dicts on hit

### Embeddings (`utils/embedding.py`)
- `cached_generate_embeddings()` — Drop-in replacement for `generate_embeddings()` with caching
- Cache key = `(source_id, chunk_index)` or `("generic", index)`
- For use in background commands where source_id is known

### Provider Availability (`api/routers/models.py`)
- `GET /models/providers` caches full response for 5 minutes
- Cache invalidated on: create/delete model, sync, auto-assign, update defaults

### Config Endpoint (`api/routers/config.py`)
- `GET /api/config/redis` — Returns availability + hit/miss stats
- `POST /api/config/redis/reset-metrics` — Resets metrics counters

## Docker Compose

Redis is included in `docker-compose.yml` with:
- Alpine-based image for small footprint
- AOF persistence (`appendonly yes`)
- Memory cap: 256MB with `allkeys-lru` eviction
- Health check: `redis-cli ping`
- Named volume: `./redis_data:/data`

## Important Quirks & Gotchas

- **Cache is optional**: If `REDIS_URL` is not set, cache operations are silently skipped
- **Embedding serialization**: Embeddings are packed as `struct.pack("Nd", *floats)` then base64-encoded — more compact than JSON
- **Context cache key**: Uses `ContextConfig.to_cache_key()` which sorts dict keys for deterministic hashing
- **Context cache miss**: If reconstruction of `ContextItem` from cached dict fails (e.g. field mismatch), the item is skipped and logged
- **N+1 invalidation risk**: `invalidate_source_cache()` queries DB for notebook relations to cascade invalidation — consider batching if many sources change at once
- **No distributed invalidation**: In multi-instance deployments, cache invalidation is local only; consider Redis pub/sub or external invalidation for horizontal scaling

## Phase 4: Intent-Validated Semantic Reuse

Notebook answers use a three-tier decision tree:

1. **High (`>= 0.97`)** — reuse the cached answer immediately.
2. **Mid (`0.92–0.97`)** — send the two short questions plus cached
   intent/entities to the configured answer model and request a JSON yes/no
   decision. Reuse only when validation explicitly returns true.
3. **Low (`< 0.92`)** — treat as a miss and generate a fresh answer.

The validator normally emits only a tiny JSON response, so its cost is much
lower than rerunning retrieval and the complete answer graph. New cache entries
are automatically enriched with a compact intent label and answer-changing
entities (years, versions, people, quantities, negation, and locations).

Configuration:

- `OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_VALIDATION` (default `1`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_TIMEOUT_MS` (default `1500`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_MIN_SIM` (default `0.92`)

Monitoring fields exposed by `/api/config/answer-cache/analytics`:

- `intent_validations_total`, `intent_validations_passed`,
  `intent_validations_failed`
- `intent_validation_avg_latency_ms`
- `tokens_saved_by_intent_validation`
- `quality_failures_by_source`

Failure behavior is deliberately conservative. A timeout, provider error,
disabled validator, malformed JSON, unusual Unicode, unavailable model, or a
legacy entry without intent metadata always falls through to a fresh answer;
it never crashes the user request. Quality-failure reports distinguish exact,
semantic-high, intent-validated semantic-mid, and fresh answers.

## Phase 5: Adaptive Threshold Tuning

The optional background tuner adjusts the high and mid similarity thresholds
from production quality signals. It runs outside the request hot path and is
disabled by default.

Rules:

- Mid quality-failure rate above 15% raises the mid threshold by 0.005.
- Mid quality-failure rate below 5% lowers it by 0.005.
- High quality-failure rate above 5% raises the high threshold by 0.005.
- Intent-validator failure ratio above 60% stops all automatic adjustment and
  emits a warning because this usually indicates a provider/validator issue.
- Fewer than 50 effective samples produces no adjustment.
- Hard bounds and a minimum gap guarantee `HIGH > MID`.

Configuration:

- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_ENABLED` (default `0`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_INTERVAL` (default `300` seconds)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_HIGH_MIN/MAX` (defaults `0.94/0.99`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_MIN/MAX` (defaults `0.85/0.97`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE` (default `0.15`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE` (default `0.05`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_ADJUST_STEP` (default `0.005`)

`GET /api/config/answer-cache/analytics` exposes current thresholds, signal
confidence, sample counts, distributions, and the last adjustment timestamp.
`POST /api/config/answer-cache/thresholds/reset` restores configured defaults.
After a process/metrics restart, the tuner waits for sufficient new traffic
before changing thresholds again.

## Phase 6: Decision Audit & Reliability

### Phase 6.4 — Tuner Decision Log

Every threshold adjustment is persisted to a rolling 100-entry Redis list
(`cache:tuning:decision_log`) with a human-readable reason and a snapshot of
the signals that triggered the change. This lets operators audit tuning
decisions without reading log files.

`GET /api/config/answer-cache/thresholds/history` — recent tuning decisions,
newest first.
`POST /api/config/answer-cache/thresholds/history/clear` — reset the log.
`OPEN_NOTEBOOK_TUNER_HISTORY_LIMIT` (default 100) caps log size.

### Phase 6.5 — Intent-Validation Circuit Breaker

The circuit breaker guards the intent-validation LLM call against slow or
failing model providers. It is a 3-state machine persisted in Redis so it
survives restarts:

```
CLOSED ──(failures ≥ 5)──► OPEN ──(60s timeout)──► HALF_OPEN
                                               ▲            │
                         (validation succeeds)  └────────────┘
```

- **CLOSED** — validation runs normally; failures increment the counter.
- **OPEN** — validation returns `None` immediately (fast-fail), callers
  fall back to fresh answer generation. After the timeout, transitions to
  HALF_OPEN.
- **HALF_OPEN** — allows up to 3 probe validations. All succeed → CLOSED.
  Any failure → OPEN again.

When the circuit is OPEN, no LLM call is made, so cascade failures and
head-of-line blocking are prevented.

Configuration (all have safe defaults, on by default):
- `OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER` (default `1`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD` (default `5`)
- `OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT` (default `60` seconds)
- `OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS` (default `3`)

API:
- `GET /api/config/answer-cache/circuit-breaker/status` — current state + config
- `POST /api/config/answer-cache/circuit-breaker/open` — manual trip
- `POST /api/config/answer-cache/circuit-breaker/close` — manual reset
- `GET /api/config/answer-cache/analytics` → `circuit_breaker` field

## How to Add New Cache Target

1. Add TTL constant to `open_notebook/config.py`
2. Add `get_X()` / `set_X()` / `invalidate_X()` methods to `CacheService`
3. Call invalidation in the appropriate service/router after data changes
4. Add metrics tracking with `cache_metrics.record_hit/miss/set()`
