"""
LSP_SIET_* settings, with the old OPEN_NOTEBOOK_* names as a fallback.

The settings were renamed from OPEN_NOTEBOOK_* to LSP_SIET_*. Production .env files
and compose environments still use the old names, so they keep working: ``env()``
reads the new name and, when that is not set, the old one.

    from siet_core.env import env

    ttl = int(env("LSP_SIET_CACHE_TTL", "3600"))

Rules:

* The first of the new and the old name that has a value wins (new before old).
* A blank value never shadows a real one. A ``LSP_SIET_PASSWORD=`` line copied from
  .env.example next to an operator's ``OPEN_NOTEBOOK_PASSWORD=secret`` must not
  switch the password off. A name that is only ever set blank stays blank, as
  ``os.getenv(name, default)`` would return it, so "no password" keeps working.
* The first read through an old name logs one warning per name and process.
* When both names are set to different non-blank values, one warning per name and process says so
  (it names both and says the new one wins): an operator who adds a new name next to the old one
  with another value changes the setting silently otherwise. ``siet_core.utils.encryption`` goes
  further for the encryption key and refuses to start: stored credentials can not be read with
  another key (a mismatch must not pick a winner).
* A name with no entry in LEGACY_NAMES is an ordinary environment read, so the same
  helper serves ``JWT_SECRET`` and friends.
* Docker secrets: ``LSP_SIET_PASSWORD_FILE`` and ``LSP_SIET_ENCRYPTION_KEY_FILE`` are
  in the table too, so ``get_secret_from_env`` finds a file under either name.

Not renamed on purpose (values that live in tokens, the database or ciphertext):
JWT_ISSUER, PBKDF2_SALT and the SurrealDB namespace/database stay "open_notebook".
"""

import os
from typing import overload

from loguru import logger

# new name -> old name
LEGACY_NAMES: dict[str, str] = {
    # Credentials and access
    "LSP_SIET_ENCRYPTION_KEY": "OPEN_NOTEBOOK_ENCRYPTION_KEY",
    "LSP_SIET_ENCRYPTION_KEY_FILE": "OPEN_NOTEBOOK_ENCRYPTION_KEY_FILE",
    "LSP_SIET_PASSWORD": "OPEN_NOTEBOOK_PASSWORD",
    "LSP_SIET_PASSWORD_FILE": "OPEN_NOTEBOOK_PASSWORD_FILE",
    "LSP_SIET_API_URL": "OPEN_NOTEBOOK_API_URL",
    "LSP_SIET_API_KEY": "OPEN_NOTEBOOK_API_KEY",
    # Request limits, ingestion
    "LSP_SIET_MAX_UPLOAD_SIZE_MB": "OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB",
    "LSP_SIET_ENABLE_CRAWL4AI": "OPEN_NOTEBOOK_ENABLE_CRAWL4AI",
    "LSP_SIET_ENABLE_DOCLING": "OPEN_NOTEBOOK_ENABLE_DOCLING",
    "LSP_SIET_CHUNK_SIZE": "OPEN_NOTEBOOK_CHUNK_SIZE",
    "LSP_SIET_CHUNK_OVERLAP": "OPEN_NOTEBOOK_CHUNK_OVERLAP",
    "LSP_SIET_MIN_CHUNK_SIZE": "OPEN_NOTEBOOK_MIN_CHUNK_SIZE",
    "LSP_SIET_EMBEDDING_BATCH_SIZE": "OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE",
    "LSP_SIET_WORKER_MAX_TASKS": "OPEN_NOTEBOOK_WORKER_MAX_TASKS",
    # Redis cache TTLs
    "LSP_SIET_CACHE_TTL": "OPEN_NOTEBOOK_CACHE_TTL",
    "LSP_SIET_VECTOR_SEARCH_CACHE_TTL": "OPEN_NOTEBOOK_VECTOR_SEARCH_CACHE_TTL",
    "LSP_SIET_CONTEXT_CACHE_TTL": "OPEN_NOTEBOOK_CONTEXT_CACHE_TTL",
    "LSP_SIET_EMBEDDING_CACHE_TTL": "OPEN_NOTEBOOK_EMBEDDING_CACHE_TTL",
    "LSP_SIET_NOTEBOOK_CACHE_TTL": "OPEN_NOTEBOOK_NOTEBOOK_CACHE_TTL",
    "LSP_SIET_PROVIDER_CACHE_TTL": "OPEN_NOTEBOOK_PROVIDER_CACHE_TTL",
    # Answer cache
    "LSP_SIET_ANSWER_CACHE_TTL": "OPEN_NOTEBOOK_ANSWER_CACHE_TTL",
    "LSP_SIET_ANSWER_CACHE_SIMILARITY": "OPEN_NOTEBOOK_ANSWER_CACHE_SIMILARITY",
    "LSP_SIET_ANSWER_CACHE_MAX_ENTRIES": "OPEN_NOTEBOOK_ANSWER_CACHE_MAX_ENTRIES",
    "LSP_SIET_ANSWER_CACHE_HIGH_SIMILARITY": "OPEN_NOTEBOOK_ANSWER_CACHE_HIGH_SIMILARITY",
    "LSP_SIET_ANSWER_CACHE_MID_SIMILARITY": "OPEN_NOTEBOOK_ANSWER_CACHE_MID_SIMILARITY",
    "LSP_SIET_ANSWER_CACHE_INTENT_VALIDATION": "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_VALIDATION",
    "LSP_SIET_ANSWER_CACHE_INTENT_TIMEOUT_MS": "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_TIMEOUT_MS",
    "LSP_SIET_ANSWER_CACHE_INTENT_MIN_SIM": "OPEN_NOTEBOOK_ANSWER_CACHE_INTENT_MIN_SIM",
    # Answer cache: threshold tuner
    "LSP_SIET_ANSWER_CACHE_TUNER_ENABLED": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_ENABLED",
    "LSP_SIET_ANSWER_CACHE_TUNER_INTERVAL": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_INTERVAL",
    "LSP_SIET_ANSWER_CACHE_TUNER_HIGH_MIN": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_HIGH_MIN",
    "LSP_SIET_ANSWER_CACHE_TUNER_HIGH_MAX": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_HIGH_MAX",
    "LSP_SIET_ANSWER_CACHE_TUNER_MID_MIN": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_MIN",
    "LSP_SIET_ANSWER_CACHE_TUNER_MID_MAX": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_MAX",
    "LSP_SIET_ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_INCREASE",
    "LSP_SIET_ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_FAIL_RATE_DECREASE",
    "LSP_SIET_ANSWER_CACHE_TUNER_MID_ADJUST_STEP": "OPEN_NOTEBOOK_ANSWER_CACHE_TUNER_MID_ADJUST_STEP",
    "LSP_SIET_TUNER_HISTORY_LIMIT": "OPEN_NOTEBOOK_TUNER_HISTORY_LIMIT",
    # Answer cache: circuit breaker
    "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER": "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER",
    "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD": "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_ERROR_THRESHOLD",
    "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT": "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_OPEN_TIMEOUT",
    "LSP_SIET_ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS": "OPEN_NOTEBOOK_ANSWER_CACHE_CIRCUIT_BREAKER_HALF_OPEN_REQUESTS",
    # Never read from Python (a Next.js build-time value, see platform/frontend/src/lib/env.ts);
    # listed so every old/new pair is in one place for the codemod and the tests.
    "NEXT_PUBLIC_LSP_SIET_API_URL": "NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL",
}

# Old names already warned about, so the log carries one line per name and process.
_warned: set[str] = set()


def _warn_once(old: str, new: str) -> None:
    if old in _warned:
        return
    _warned.add(old)
    logger.warning(f"{old} is deprecated; rename it to {new} (the old name still works)")


def conflicting(name: str) -> bool:
    """True when ``name`` and its old name are both set to non-blank, different values."""
    legacy = LEGACY_NAMES.get(name)
    if not legacy:
        return False
    new_value, old_value = os.environ.get(name), os.environ.get(legacy)
    return bool(new_value) and bool(old_value) and new_value != old_value


def _warn_conflict_once(name: str, legacy: str) -> None:
    key = f"{legacy} != {name}"
    if key in _warned:
        return
    _warned.add(key)
    logger.warning(
        f"{name} and {legacy} are both set, with different values: {name} wins and {legacy} is ignored. "
        f"Remove {legacy} (or give both the same value) so the setting is not changed by accident"
    )


@overload
def env(name: str, default: str) -> str: ...


@overload
def env(name: str, default: None = None) -> str | None: ...


def env(name: str, default: str | None = None) -> str | None:
    """Read setting ``name`` (a new name, e.g. ``LSP_SIET_CHUNK_SIZE``), else its old name, else ``default``."""
    legacy = LEGACY_NAMES.get(name)
    blank: str | None = None
    if legacy and conflicting(name):
        _warn_conflict_once(name, legacy)
    for candidate in (name, legacy) if legacy else (name,):
        value = os.environ.get(candidate)
        if value:
            if candidate != name:
                _warn_once(candidate, name)
            return value
        if value is not None:
            blank = value
    return default if blank is None else blank
