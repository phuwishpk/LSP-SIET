"""
What siet-platform plugs into open-notebook's extension points
(open_notebook.extensions; the call sites are listed in docs/UPSTREAM.md).

* auth       workspace JWT instead of the single password
* provider   every embedding call through the throttle gate, with usage records
* events     knowledge_version bumps + answer-cache invalidation on notebook /
             source changes; provider-availability cache drop on model changes
* caches     vector search, provider availability
* filters    ``asset_url`` in source context (URL citations), today's date in
             the chat prompt (Thai Buddhist year included)
* prompts    the Thai tutoring prompts in siet_platform/prompts take precedence
* lifespan   k-track migrations, MariaDB schema, seed data, cache tuner
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional

from loguru import logger

from open_notebook import extensions
from open_notebook.exceptions import RateLimitError

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def register() -> None:
    from siet_platform import startup, throttle
    from siet_platform.auth_backend import WorkspaceAuthBackend

    extensions.set_auth_backend(WorkspaceAuthBackend())

    extensions.set_provider_gate(_provider_gate)
    extensions.add_final_provider_error(
        lambda exc: isinstance(exc, (throttle.ProviderBusy, RateLimitError))
    )

    extensions.on("notebook.changed", _notebook_changed)
    extensions.on("source.changed", _source_changed)
    extensions.on("models.changed", _models_changed)

    extensions.add_cache("vector_search", _vector_search_get, _vector_search_set)
    extensions.add_cache("provider_availability", _providers_get, _providers_set)

    extensions.add_filter("source.context", _source_context)
    extensions.add_filter("chat.prompt_data", _chat_prompt_data)

    _prepend_prompts_path(PROMPTS_DIR)

    extensions.on("app.startup", startup.run_migrations, critical=True)
    extensions.on("app.startup", startup.on_startup)
    extensions.on("app.shutdown", startup.on_shutdown)


# ---------------------------------------------------------------------------
# provider gate
# ---------------------------------------------------------------------------


async def _provider_gate(
    kind: str,
    call,
    *,
    model: Any = None,
    label: str = "",
    inputs: Optional[List[str]] = None,
) -> Any:
    """A few calls in flight at a time; a provider 429 is retried with backoff there."""
    from siet_platform import throttle, usage

    if kind != "embedding":
        return await throttle.run(kind, call, label=label)
    with usage.Timer() as timer:
        result = await throttle.run("embedding", call, label=label)
    await usage.record(
        kind=usage.KIND_EMBEDDING,
        model=getattr(model, "model_name", None),
        provider=getattr(model, "provider", None),
        input_tokens=usage.estimate_tokens(inputs or []),
        latency_ms=timer.ms,
        estimated=True,
    )
    return result


# ---------------------------------------------------------------------------
# cache invalidation (Phase 2 knowledge_version bumps)
# ---------------------------------------------------------------------------


async def _notebook_changed(notebook_id: str, clear_cache: bool = True) -> None:
    from siet_platform.cache.invalidation import invalidate_after_notebook_change

    await invalidate_after_notebook_change(notebook_id, clear_cache=clear_cache)


async def _source_changed(
    source_id: str,
    notebook_ids: Optional[List[str]] = None,
    clear_cache: bool = True,
) -> None:
    from siet_platform.cache.invalidation import invalidate_after_source_change

    if notebook_ids is None:
        await invalidate_after_source_change(source_id, clear_cache=clear_cache)
    else:
        await invalidate_after_source_change(
            source_id, extra_notebook_ids=list(notebook_ids), clear_cache=clear_cache
        )


async def _models_changed() -> None:
    from siet_platform.cache.service import cache_service

    await cache_service.invalidate_provider_cache()


# ---------------------------------------------------------------------------
# caches
# ---------------------------------------------------------------------------


async def _vector_search_get(key: Dict[str, Any]) -> Any:
    from siet_platform.cache.service import cache_service

    return await cache_service.get_vector_search_results(
        notebook_id="global", query=str(key), limit=key["r"]
    )


async def _vector_search_set(key: Dict[str, Any], results: Any) -> None:
    from siet_platform.cache.service import cache_service

    await cache_service.set_vector_search_results(
        notebook_id="global", query=str(key), results=results
    )


async def _providers_get(_key: Any) -> Any:
    from siet_platform.cache.service import cache_service

    cached = await cache_service.get_provider_availability()
    if cached is not None:
        logger.debug("Provider availability cache hit")
    return cached


async def _providers_set(_key: Any, value: Any) -> None:
    from siet_platform.cache.service import cache_service

    await cache_service.set_provider_availability(value)


# ---------------------------------------------------------------------------
# filters
# ---------------------------------------------------------------------------


def _source_context(context: Dict[str, Any], *, source: Any) -> Dict[str, Any]:
    """Expose where a source lives so answers can cite it as [url:...]."""
    asset_url = None
    if source.asset:
        asset_url = source.asset.url or source.asset.file_path
    return {**context, "asset_url": asset_url}


def _chat_prompt_data(state: Dict[str, Any]) -> Dict[str, Any]:
    today = date.today()
    return {
        **dict(state),
        "current_date_iso": today.isoformat(),
        "current_year_ce": today.year,
        "current_year_be": today.year + 543,
    }


# ---------------------------------------------------------------------------
# prompts
# ---------------------------------------------------------------------------


def _prepend_prompts_path(directory: Path) -> None:
    """ai_prompter searches $PROMPTS_PATH before ./prompts, one template at a time."""
    current = [p for p in os.environ.get("PROMPTS_PATH", "").split(":") if p]
    if str(directory) not in current:
        os.environ["PROMPTS_PATH"] = ":".join([str(directory), *current])
