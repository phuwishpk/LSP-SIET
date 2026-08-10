"""
Cache invalidation helpers for Open Notebook.

Provides decorators and utilities to automatically invalidate cache entries
when source data changes.

Phase 2 additions:
- ``invalidate_after_source_change`` bumps the source's
  ``knowledge_version`` (and every notebook that references it) via the
  SurrealDB helpers from migration 21. The answer cache fingerprint
  includes the version, so stale entries are skipped automatically.
- ``invalidate_after_notebook_change`` bumps the notebook's version and
  optionally extra-clears the answer cache for that scope to absorb
  schema/prompt changes that can't be expressed via the version alone.
"""

from __future__ import annotations

import inspect
from functools import wraps
from typing import Any, Callable, Optional, TypeVar, Awaitable

from loguru import logger

from open_notebook.cache.metrics import cache_metrics
from open_notebook.cache.service import cache_service

F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


async def _bump_version(record_id: str, kind: str) -> Optional[int]:
    """Call the migration-21 SurrealDB helper to bump a knowledge version."""
    if not record_id:
        return None
    try:
        from open_notebook.database.repository import ensure_record_id, repo_query

        func = (
            "fn::bump_source_knowledge_version"
            if kind == "source"
            else "fn::bump_notebook_knowledge_version"
        )
        result = await repo_query(
            f"RETURN {func}($id);",
            {"id": ensure_record_id(record_id)},
        )
        if isinstance(result, list) and result:
            return int(result[0])
        return None
    except Exception as exc:
        logger.warning(
            f"Failed to bump knowledge_version for {kind} {record_id}: {exc}"
        )
        return None


async def _clear_answer_cache_for_notebook(notebook_id: str) -> None:
    """
    Phase 2: best-effort prefix delete of any answer-cache entries that
    were scoped to this notebook. Belt-and-suspenders because the new
    fingerprint already includes the notebook knowledge_version, but this
    removes any race-window entries that may have been written between a
    doc edit and the version bump.
    """
    try:
        deleted = await cache_service.delete_pattern(f"answer:exact:*nb={notebook_id}*")
        deleted += await cache_service.delete_pattern(
            f"answer:semantic:*nb={notebook_id}*"
        )
        if deleted:
            cache_metrics.record_invalidation("answer_cache", deleted)
            logger.info(
                f"Cleared {deleted} answer-cache entries for notebook {notebook_id}"
            )
    except Exception as exc:
        logger.warning(
            f"Failed to clear answer cache for notebook {notebook_id}: {exc}"
        )


async def _resolve_notebook_ids_for_source(source_id: str) -> list[str]:
    """Return the list of notebook IDs that reference a given source."""
    try:
        from open_notebook.database.repository import ensure_record_id, repo_query

        rows = await repo_query(
            "SELECT VALUE out FROM reference WHERE in = $id",
            {"id": ensure_record_id(source_id)},
        )
        return [str(r) for r in rows or []]
    except Exception as exc:
        logger.warning(
            f"Failed to resolve notebooks for source {source_id}: {exc}"
        )
        return []


async def invalidate_after_source_change(
    source_id: str,
    extra_notebook_ids: Optional[list[str]] = None,
    *,
    clear_cache: bool = True,
) -> Optional[int]:
    """
    Phase 2: bump the source's knowledge_version and every notebook that
    references it. Optionally belt-and-suspenders the answer cache too.

    Returns the new version of the source, or None on failure.
    """
    if not source_id:
        return None
    try:
        new_version = await _bump_version(source_id, "source")
    except Exception as exc:
        logger.warning(
            f"invalidate_after_source_change: source bump failed for {source_id}: {exc}"
        )
        new_version = None
    try:
        notebook_ids = await _resolve_notebook_ids_for_source(source_id)
    except Exception as exc:
        logger.warning(
            f"invalidate_after_source_change: notebook lookup failed: {exc}"
        )
        notebook_ids = []
    for nb_id in extra_notebook_ids or []:
        if nb_id not in notebook_ids:
            notebook_ids.append(nb_id)
    for nb_id in notebook_ids:
        try:
            await _bump_version(nb_id, "notebook")
        except Exception as exc:
            logger.warning(
                f"invalidate_after_source_change: notebook bump failed for {nb_id}: {exc}"
            )
        if clear_cache:
            try:
                await _clear_answer_cache_for_notebook(nb_id)
            except Exception as exc:
                logger.warning(
                    f"invalidate_after_source_change: cache clear failed for {nb_id}: {exc}"
                )
    logger.info(
        f"Source {source_id} → knowledge_version={new_version}, "
        f"bumped {len(notebook_ids)} referencing notebook(s)"
    )
    return new_version


async def invalidate_after_notebook_change(
    notebook_id: str,
    *,
    clear_cache: bool = True,
) -> Optional[int]:
    """Phase 2: bump a notebook's knowledge_version and clear its cache."""
    if not notebook_id:
        return None
    try:
        new_version = await _bump_version(notebook_id, "notebook")
    except Exception as exc:
        logger.warning(
            f"invalidate_after_notebook_change: bump failed for {notebook_id}: {exc}"
        )
        new_version = None
    if clear_cache:
        try:
            await _clear_answer_cache_for_notebook(notebook_id)
        except Exception as exc:
            logger.warning(
                f"invalidate_after_notebook_change: cache clear failed: {exc}"
            )
    logger.info(
        f"Notebook {notebook_id} → knowledge_version={new_version}"
    )
    return new_version


async def compute_notebook_knowledge_version(notebook_id: str) -> int:
    """
    Return the composite knowledge version for a notebook + all its
    sources. Used by the answer cache fingerprint.

    Falls back to 0 on failure so callers can still proceed (the cache
    will just be slightly looser than ideal).
    """
    if not notebook_id:
        return 0
    try:
        from open_notebook.database.repository import ensure_record_id, repo_query

        result = await repo_query(
            "RETURN fn::compute_notebook_knowledge_version($id);",
            {"id": ensure_record_id(notebook_id)},
        )
        if isinstance(result, list) and result:
            return int(result[0])
    except Exception as exc:
        logger.warning(
            f"compute_notebook_knowledge_version failed for {notebook_id}: {exc}"
        )
    return 0


def invalidate_on_change(notebook_id_param: str = "notebook_id"):
    """
    Decorator to invalidate notebook-related cache after a function completes.

    Args:
        notebook_id_param: Name of the parameter containing the notebook_id

    Usage:
        @invalidate_on_change("notebook_id")
        async def add_source(notebook_id: str, ...):
            ...
    """

    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract notebook_id from args/kwargs
            import inspect

            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            notebook_id = bound.arguments.get(notebook_id_param)

            # Execute the function
            result = await func(*args, **kwargs)

            # Invalidate cache
            if notebook_id:
                try:
                    await cache_service.invalidate_notebook(notebook_id)
                except Exception as e:
                    logger.warning(f"Cache invalidation failed: {e}")

            return result

        return wrapper  # type: ignore

    return decorator


def invalidate_source_cache(source_id_param: str = "source_id"):
    """
    Decorator to invalidate source-related cache (embeddings, context) after a function completes.

    Args:
        source_id_param: Name of the parameter containing the source_id

    Usage:
        @invalidate_source_cache("source_id")
        async def update_source(source_id: str, ...):
            ...
    """

    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract source_id from args/kwargs
            import inspect

            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            source_id = bound.arguments.get(source_id_param)

            # Execute the function
            result = await func(*args, **kwargs)

            # Invalidate cache
            if source_id:
                try:
                    await cache_service.invalidate_embedding(source_id)
                    # Also invalidate notebooks that contain this source
                    from open_notebook.database.repository import repo_query

                    relations = await repo_query(
                        "SELECT out FROM source WHERE id = $id",
                        {"id": source_id},
                    )
                    for rel in relations:
                        if out_id := rel.get("out"):
                            notebook_id = str(out_id).split(":")[1] if ":" in str(out_id) else str(out_id)
                            await cache_service.invalidate_notebook(notebook_id)
                except Exception as e:
                    logger.warning(f"Source cache invalidation failed: {e}")

            return result

        return wrapper  # type: ignore

    return decorator


def invalidate_notebook_cache(notebook_id_param: str = "notebook_id"):
    """
    Decorator to invalidate all notebook-related cache after a function completes.

    This is broader than invalidate_on_change - it invalidates context, search,
    and notebook metadata.

    Args:
        notebook_id_param: Name of the parameter containing the notebook_id

    Usage:
        @invalidate_notebook_cache("notebook_id")
        async def update_notebook(notebook_id: str, ...):
            ...
    """

    def decorator(func: F) -> F:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            import inspect

            sig = inspect.signature(func)
            bound = sig.bind(*args, **kwargs)
            bound.apply_defaults()
            notebook_id = bound.arguments.get(notebook_id_param)

            result = await func(*args, **kwargs)

            if notebook_id:
                try:
                    await cache_service.invalidate_notebook(notebook_id)
                except Exception as e:
                    logger.warning(f"Notebook cache invalidation failed: {e}")

            return result

        return wrapper  # type: ignore

    return decorator


async def invalidate_after_source_delete(source_id: str) -> None:
    """
    Helper to invalidate cache after a source is deleted.
    Called explicitly from delete operations.
    """
    try:
        # Invalidate embeddings for this source
        await cache_service.invalidate_embedding(source_id)

        # Find and invalidate affected notebooks
        from open_notebook.database.repository import repo_query

        relations = await repo_query(
            "SELECT out FROM source WHERE id = $id",
            {"id": source_id},
        )
        for rel in relations:
            if out_id := rel.get("out"):
                notebook_id = str(out_id).split(":")[1] if ":" in str(out_id) else str(out_id)
                await cache_service.invalidate_notebook(notebook_id)
    except Exception as e:
        logger.warning(f"Post-delete cache invalidation failed: {e}")


async def invalidate_after_note_change(notebook_id: str) -> None:
    """
    Helper to invalidate context cache after a note is added/updated/deleted.
    Called explicitly from note operations.
    """
    try:
        await cache_service.invalidate_context(notebook_id)
    except Exception as e:
        logger.warning(f"Note cache invalidation failed: {e}")


async def invalidate_after_insight_change(notebook_id: str) -> None:
    """
    Helper to invalidate context cache after an insight is added/updated/deleted.
    Called explicitly from insight operations.
    """
    try:
        await cache_service.invalidate_context(notebook_id)
    except Exception as e:
        logger.warning(f"Insight cache invalidation failed: {e}")


async def invalidate_after_model_change() -> None:
    """
    Helper to invalidate model-related cache after models/credentials change.
    """
    try:
        await cache_service.invalidate_provider_cache()
    except Exception as e:
        logger.warning(f"Model cache invalidation failed: {e}")
