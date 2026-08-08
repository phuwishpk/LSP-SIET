"""
Cache invalidation helpers for Open Notebook.

Provides decorators and utilities to automatically invalidate cache entries
when source data changes.
"""

from __future__ import annotations

from functools import wraps
from typing import Any, Callable, TypeVar, Awaitable

from loguru import logger

from open_notebook.cache.service import cache_service

F = TypeVar("F", bound=Callable[..., Awaitable[Any]])


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
