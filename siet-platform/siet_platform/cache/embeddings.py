"""Embeddings with a Redis cache for repeated content (per source chunk or content hash)."""

from typing import List, Optional

from loguru import logger

from open_notebook.utils.embedding import generate_embeddings


async def cached_generate_embeddings(
    texts: List[str],
    source_id: Optional[str] = None,
    command_id: Optional[str] = None,
) -> List[List[float]]:
    """
    Generate embeddings with Redis caching for repeated content.

    When source_id is provided, embeddings are cached per (source_id, chunk_index).
    When source_id is not provided, uses content hash for cache key (useful for notes).

    Args:
        texts: List of text strings to embed
        source_id: Optional source ID for cache key scoping
        command_id: Optional command ID for error logging context

    Returns:
        List of embedding vectors, one per input text

    Raises:
        ValueError: If no embedding model is configured
        RuntimeError: If embedding generation fails
    """
    from siet_platform.cache.service import cache_service

    if not texts:
        return []

    # Build index -> embedding mapping from cache
    cached_embeddings: dict[int, List[float]] = {}
    texts_to_embed: list[tuple[int, str]] = []

    for idx, text in enumerate(texts):
        cached = await cache_service.get_embedding(source_id or "generic", idx)
        if cached is not None:
            cached_embeddings[idx] = cached
        else:
            texts_to_embed.append((idx, text))

    # All cached - return directly
    if not texts_to_embed:
        logger.debug(f"All {len(texts)} embeddings cache hit for source {source_id}")
        return [cached_embeddings[i] for i in range(len(texts))]

    # Some or all need generation
    new_texts = [t for _, t in texts_to_embed]
    new_embeddings = await generate_embeddings(new_texts, command_id=command_id)

    # Store new embeddings in cache and build result
    result: List[Optional[List[float]]] = [None] * len(texts)

    # Fill cached
    for idx, emb in cached_embeddings.items():
        result[idx] = emb

    # Fill newly generated
    for (idx, _text), emb in zip(texts_to_embed, new_embeddings):
        result[idx] = emb
        # Cache it
        await cache_service.set_embedding(source_id or "generic", idx, emb)

    # Ensure no None values remain
    if None in result:
        raise RuntimeError("Embedding generation failed to produce all results")

    return result  # type: ignore
