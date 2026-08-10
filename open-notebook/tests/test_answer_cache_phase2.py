"""
Phase 2 tests for knowledge-version cache invalidation.

These tests focus on the deterministic, side-effect-free helpers:
- ``context_fingerprint`` now mixes per-notebook knowledge_version into
  the hash, so the same notebook set with different versions produces
  different fingerprints.
- ``NotebookContextBlock.knowledge_version`` and
  ``ResolvedNotebooks.knowledge_version`` round-trip correctly.
- The cache invalidation helpers (``invalidate_after_source_change``,
  ``invalidate_after_notebook_change``,
  ``compute_notebook_knowledge_version``) handle their inputs without
  raising when SurrealDB is unavailable so the rest of the system stays
  working in degraded mode.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from open_notebook.cache.answer_cache import context_fingerprint
from open_notebook.cache.invalidation import (
    compute_notebook_knowledge_version,
    invalidate_after_notebook_change,
    invalidate_after_source_change,
)
from open_notebook.features.service import NotebookContextBlock, ResolvedNotebooks


def _block(nb_id: str, kv: int = 1, chunks=None) -> NotebookContextBlock:
    return NotebookContextBlock(
        notebook_id=nb_id,
        notebook_name=f"Notebook {nb_id}",
        chunks=chunks or [],
        total_chars=0,
        knowledge_version=kv,
    )


class TestContextFingerprintKnowledgeVersion:
    def test_same_notebooks_diff_versions_differ(self):
        a = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=1)],
            knowledge_version=1,
        )
        b = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=2)],
            knowledge_version=2,
        )
        assert context_fingerprint(a, language="en", knowledge_version=1) != context_fingerprint(
            b, language="en", knowledge_version=2
        )

    def test_doc_edit_invalidates_cache(self):
        # User asks the same question twice. First time the source was v3,
        # second time it's v4. The fingerprints must differ.
        before = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=3)],
            knowledge_version=3,
        )
        after = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=4)],
            knowledge_version=4,
        )
        assert context_fingerprint(before, language="th") != context_fingerprint(
            after, language="th"
        )

    def test_rollup_ignores_arbitrary_order(self):
        # The fingerprint sorts notebooks so order doesn't matter.
        a = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=2), _block("nb:2", kv=3)],
            knowledge_version=3,
        )
        b = ResolvedNotebooks(
            resolved=[_block("nb:2", kv=3), _block("nb:1", kv=2)],
            knowledge_version=3,
        )
        assert context_fingerprint(a, language="en") == context_fingerprint(
            b, language="en"
        )

    def test_tenant_still_partitioned(self):
        a = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=1)],
            knowledge_version=1,
        )
        b = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=1)],
            knowledge_version=1,
        )
        assert context_fingerprint(a, tenant_id="u1") != context_fingerprint(
            b, tenant_id="u2"
        )


class TestInvalidationHelpers:
    @pytest.mark.asyncio
    async def test_invalidate_after_source_change_swallow_db_errors(self):
        # When the bump helpers fail (e.g. SurrealDB down), we expect the
        # function to return None without raising so the caller can still
        # proceed with the originally requested operation.
        with patch(
            "open_notebook.cache.invalidation._bump_version",
            new=AsyncMock(side_effect=Exception("boom")),
        ), patch(
            "open_notebook.cache.invalidation._resolve_notebook_ids_for_source",
            new=AsyncMock(return_value=[]),
        ):
            new_version = await invalidate_after_source_change(
                "source:abc", clear_cache=False
            )
            assert new_version is None

    @pytest.mark.asyncio
    async def test_invalidate_after_notebook_change_swallow_db_errors(self):
        with patch(
            "open_notebook.cache.invalidation._bump_version",
            new=AsyncMock(side_effect=Exception("boom")),
        ):
            new_version = await invalidate_after_notebook_change(
                "notebook:abc", clear_cache=False
            )
            assert new_version is None

    @pytest.mark.asyncio
    async def test_invalidate_after_source_change_extra_notebooks(self):
        # If the caller passes extra notebooks that aren't in the
        # reference table, they should still be bumped.
        bumped: list[tuple[str, str]] = []

        async def fake_bump(rid, kind):
            bumped.append((kind, rid))
            return 99

        with patch(
            "open_notebook.cache.invalidation._bump_version",
            new=AsyncMock(side_effect=fake_bump),
        ), patch(
            "open_notebook.cache.invalidation._resolve_notebook_ids_for_source",
            new=AsyncMock(return_value=[]),
        ):
            await invalidate_after_source_change(
                "source:abc",
                extra_notebook_ids=["notebook:extra"],
                clear_cache=False,
            )
        kinds = [b[0] for b in bumped]
        assert "source" in kinds
        assert "notebook" in kinds
        assert ("notebook", "notebook:extra") in bumped

    @pytest.mark.asyncio
    async def test_compute_notebook_knowledge_version_falls_back(self):
        # When the helper cannot run the SurrealDB function, we want a
        # graceful fallback to 0 rather than an exception.
        with patch(
            "open_notebook.database.repository.repo_query",
            new=AsyncMock(side_effect=Exception("no db")),
        ):
            kv = await compute_notebook_knowledge_version("notebook:abc")
            assert kv == 0


class TestPydanticRoundTrip:
    def test_notebook_block_default_kv(self):
        # Backward compatibility: existing callers that don't pass
        # knowledge_version should still get a valid block.
        block = NotebookContextBlock(
            notebook_id="nb:1",
            notebook_name="x",
            chunks=[],
            total_chars=0,
        )
        assert block.knowledge_version == 0

    def test_resolved_notebooks_rollup_serializes(self):
        resolved = ResolvedNotebooks(
            resolved=[_block("nb:1", kv=5), _block("nb:2", kv=7)],
            knowledge_version=7,
        )
        payload = resolved.model_dump()
        assert payload["knowledge_version"] == 7
        assert payload["resolved"][0]["knowledge_version"] == 5
        assert payload["resolved"][1]["knowledge_version"] == 7