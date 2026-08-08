"""
Unified embedding utilities for Open Notebook.

Provides centralized embedding generation with support for:
- Single text embedding (with automatic chunking and mean pooling for large texts)
- Batch text embedding (multiple texts with automatic batching)
- Mean pooling for combining multiple embeddings into one

All embedding operations in the application should use these functions
to ensure consistent behavior and proper handling of large content.
"""

import asyncio
import os
from typing import TYPE_CHECKING, List, Optional

import numpy as np
from loguru import logger

from .chunking import CHUNK_SIZE, ContentType, chunk_text
from .token_utils import token_count


def _get_embedding_batch_size() -> int:
    """
    Read the embedding batch size from the environment.

    This is intentionally configurable because provider limits vary widely, and
    CPU-only local embedding endpoints often need smaller batches than cloud APIs.
    """
    raw = os.getenv("OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE", "50").strip()
    try:
        value = int(raw)
        if value < 1:
            raise ValueError
        return value
    except ValueError:
        logger.warning(
            "Invalid OPEN_NOTEBOOK_EMBEDDING_BATCH_SIZE='{}'; falling back to 50",
            raw,
        )
        return 50


EMBEDDING_BATCH_SIZE = _get_embedding_batch_size()
EMBEDDING_MAX_RETRIES = 3
EMBEDDING_RETRY_DELAY = 2  # seconds

# Lazy import to avoid circular dependency:
# utils -> embedding -> models -> key_provider -> provider_config -> utils
if TYPE_CHECKING:
    from open_notebook.ai.models import ModelManager


async def mean_pool_embeddings(embeddings: List[List[float]]) -> List[float]:
    """
    Combine multiple embeddings into a single embedding using mean pooling.

    Algorithm:
    1. Normalize each embedding to unit length
    2. Compute element-wise mean
    3. Normalize the result to unit length

    This approach ensures the final embedding has the same properties as
    individual embeddings (unit length) regardless of input count.

    Args:
        embeddings: List of embedding vectors (each is a list of floats)

    Returns:
        Single embedding vector (mean pooled and normalized)

    Raises:
        ValueError: If embeddings list is empty or embeddings have different dimensions
    """
    if not embeddings:
        raise ValueError("Cannot mean pool empty list of embeddings")

    if len(embeddings) == 1:
        # Single embedding - just normalize and return
        arr = np.array(embeddings[0], dtype=np.float64)
        norm = np.linalg.norm(arr)
        if norm > 0:
            arr = arr / norm
        return arr.tolist()

    # Convert to numpy array
    arr = np.array(embeddings, dtype=np.float64)

    # Verify all embeddings have same dimension
    if arr.ndim != 2:
        raise ValueError(f"Expected 2D array, got shape {arr.shape}")

    # Normalize each embedding to unit length
    norms = np.linalg.norm(arr, axis=1, keepdims=True)
    # Avoid division by zero
    norms = np.where(norms > 0, norms, 1.0)
    normalized = arr / norms

    # Compute mean
    mean = np.mean(normalized, axis=0)

    # Normalize the result
    mean_norm = np.linalg.norm(mean)
    if mean_norm > 0:
        mean = mean / mean_norm

    return mean.tolist()


async def generate_embeddings(
    texts: List[str], command_id: Optional[str] = None
) -> List[List[float]]:
    """
    Generate embeddings for multiple texts with automatic batching and retry.

    Texts are split into batches of EMBEDDING_BATCH_SIZE to avoid exceeding
    provider payload limits. Each batch is retried up to EMBEDDING_MAX_RETRIES
    times on transient failures.

    Args:
        texts: List of text strings to embed
        command_id: Optional command ID for error logging context

    Returns:
        List of embedding vectors, one per input text

    Raises:
        ValueError: If no embedding model is configured
        RuntimeError: If embedding generation fails
    """
    if not texts:
        return []

    # Lazy import to avoid circular dependency
    from open_notebook.ai.models import model_manager

    embedding_model = await model_manager.get_embedding_model()
    if not embedding_model:
        raise ValueError(
            "No embedding model configured. Please configure one in the Models section."
        )

    model_name = getattr(embedding_model, "model_name", "unknown")

    # Log text sizes for debugging
    metrics: tuple[int, int, int, int] | None = None

    def _get_size_metrics() -> tuple[int, int, int, int]:
        nonlocal metrics
        if metrics is None:
            token_sizes = [token_count(t) for t in texts]
            metrics = (
                min(token_sizes),
                max(token_sizes),
                sum(token_sizes),
                sum(len(t) for t in texts),
            )
        return metrics

    logger.opt(lazy=True).debug(
        "Generating embeddings for {} texts "
        "(tokens: min={}, max={}, total={}; chars: total={})",
        lambda: len(texts),
        lambda: _get_size_metrics()[0],
        lambda: _get_size_metrics()[1],
        lambda: _get_size_metrics()[2],
        lambda: _get_size_metrics()[3],
    )

    all_embeddings: List[List[float]] = []
    total_batches = (len(texts) + EMBEDDING_BATCH_SIZE - 1) // EMBEDDING_BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * EMBEDDING_BATCH_SIZE
        end = start + EMBEDDING_BATCH_SIZE
        batch = texts[start:end]

        for attempt in range(1, EMBEDDING_MAX_RETRIES + 1):
            try:
                batch_embeddings = await embedding_model.aembed(batch)
                all_embeddings.extend(batch_embeddings)
                break
            except Exception as e:
                cmd_context = f" (command: {command_id})" if command_id else ""
                if attempt < EMBEDDING_MAX_RETRIES:
                    logger.debug(
                        f"Embedding batch {batch_idx + 1}/{total_batches} "
                        f"attempt {attempt}/{EMBEDDING_MAX_RETRIES} failed "
                        f"using model '{model_name}'{cmd_context}: {e}. Retrying..."
                    )
                    await asyncio.sleep(EMBEDDING_RETRY_DELAY)
                else:
                    logger.debug(
                        f"Embedding batch {batch_idx + 1}/{total_batches} "
                        f"failed after {EMBEDDING_MAX_RETRIES} attempts "
                        f"using model '{model_name}'{cmd_context}: {e}"
                    )
                    raise RuntimeError(
                        f"Failed to generate embeddings using model '{model_name}' "
                        f"(batch {batch_idx + 1}/{total_batches}, "
                        f"{len(batch)} texts): {e}"
                    ) from e

    logger.debug(f"Generated {len(all_embeddings)} embeddings in {total_batches} batch(es)")
    return all_embeddings


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
    from open_notebook.cache.service import cache_service

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


async def generate_embedding(
    text: str,
    content_type: Optional[ContentType] = None,
    file_path: Optional[str] = None,
    command_id: Optional[str] = None,
) -> List[float]:
    """
    Generate a single embedding for text, handling large content via chunking and mean pooling.

    For short text (<= CHUNK_SIZE tokens):
        - Embeds directly and returns the embedding

    For long text (> CHUNK_SIZE tokens):
        - Chunks the text using appropriate splitter for content type
        - Embeds all chunks in batches
        - Combines embeddings via mean pooling

    Args:
        text: The text to embed
        content_type: Optional explicit content type for chunking
        file_path: Optional file path for content type detection
        command_id: Optional command ID for error logging context

    Returns:
        Single embedding vector (list of floats)

    Raises:
        ValueError: If text is empty or no embedding model configured
        RuntimeError: If embedding generation fails
    """
    if not text or not text.strip():
        raise ValueError("Cannot generate embedding for empty text")

    text = text.strip()
    text_tokens = token_count(text)

    # Check if chunking is needed
    if text_tokens <= CHUNK_SIZE:
        # Short text - embed directly
        logger.debug(f"Embedding short text ({text_tokens} tokens) directly")
        embeddings = await generate_embeddings([text], command_id=command_id)
        return embeddings[0]

    # Long text - chunk and mean pool
    logger.debug(f"Text exceeds chunk size ({text_tokens} tokens), chunking...")

    chunks = chunk_text(text, content_type=content_type, file_path=file_path)

    if not chunks:
        raise ValueError("Text chunking produced no chunks")

    if len(chunks) == 1:
        # Single chunk after splitting
        embeddings = await generate_embeddings(chunks, command_id=command_id)
        return embeddings[0]

    logger.debug(f"Embedding {len(chunks)} chunks and mean pooling")

    # Embed all chunks in batches
    embeddings = await generate_embeddings(chunks, command_id=command_id)

    # Mean pool to get single embedding
    pooled = await mean_pool_embeddings(embeddings)

    logger.debug(f"Mean pooled {len(embeddings)} embeddings into single vector")
    return pooled
