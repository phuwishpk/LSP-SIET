"""Cache key and (de)serialisation for notebook context builds (the "context" cache)."""

from typing import Any, Dict, List

from loguru import logger

from open_notebook.utils.context_builder import ContextConfig, ContextItem


def context_cache_key(config: ContextConfig) -> Dict[str, Any]:
    """Return a dict suitable for use as a cache key."""
    return {
        "sources": dict(sorted((config.sources or {}).items())),
        "notes": dict(sorted((config.notes or {}).items())),
        "include_insights": config.include_insights,
        "include_notes": config.include_notes,
        "max_tokens": config.max_tokens,
    }


def items_from_dicts(items_data: List[Dict]) -> List[ContextItem]:
    """Reconstruct ContextItem list from cached dict data."""
    result = []
    for item_data in items_data:
        try:
            item = ContextItem(
                id=item_data.get("id", ""),
                type=item_data.get("type", "source"),
                content=item_data.get("content", {}),
                priority=item_data.get("priority", 0),
                token_count=item_data.get("token_count"),
            )
            result.append(item)
        except Exception as e:
            logger.warning(f"Failed to reconstruct ContextItem from cache: {e}")
    return result
