"""After its chunks are embedded a source is touched (updated = now): KMITL RAG AI's
answer cache keys on it, so answers given before the new chunks were searchable are
not reused once they are."""

from unittest.mock import AsyncMock, patch

import pytest

from commands.embedding_commands import EmbedSourceInput, embed_source_command


class _Src:
    full_text = "some text " * 50
    asset = None


@pytest.mark.asyncio
async def test_source_is_touched_after_embeddings_are_stored():
    events = []

    async def repo_query(query, params=None):
        events.append(("query", query))
        return []

    async def repo_insert(table, records):
        events.append(("insert", table))

    with patch("commands.embedding_commands.Source.get", new=AsyncMock(return_value=_Src())), patch(
        "commands.embedding_commands.chunk_text", return_value=["a", "b"]
    ), patch("commands.embedding_commands.generate_embeddings", new=AsyncMock(return_value=[[0.1], [0.2]])), patch(
        "commands.embedding_commands.repo_query", new=repo_query
    ), patch("commands.embedding_commands.repo_insert", new=repo_insert):
        await embed_source_command(EmbedSourceInput(source_id="source:abc"))

    insert_at = events.index(("insert", "source_embedding"))
    touches = [i for i, e in enumerate(events) if e[0] == "query" and "SET updated = time::now()" in e[1]]
    assert touches and touches[-1] > insert_at
