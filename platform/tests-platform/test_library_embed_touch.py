"""Library ingest touches the source after embedding (see tests/test_embed_source_touch.py)."""

from unittest.mock import AsyncMock, patch

import pytest

from siet_platform import library


@pytest.mark.asyncio
async def test_library_source_is_touched_after_embedding():
    events = []

    async def repo_query(query, params=None):
        events.append(("query", query))
        return []

    async def repo_insert(table, records):
        events.append(("insert", table))

    with patch.object(library, "repo_query", new=repo_query), patch.object(library, "repo_insert", new=repo_insert), patch(
        "siet_core.utils.chunking.chunk_text", return_value=["a", "b"]
    ), patch("siet_core.utils.embedding.generate_embeddings", new=AsyncMock(return_value=[[0.1], [0.2]])):
        await library._embed_source("source:abc", "text", None)

    insert_at = events.index(("insert", "source_embedding"))
    touches = [i for i, e in enumerate(events) if e[0] == "query" and "SET updated = time::now()" in e[1]]
    assert touches and touches[-1] > insert_at
