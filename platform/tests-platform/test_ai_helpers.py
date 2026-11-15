"""siet_platform.ai_helpers: what the quiz/roadmap generators may read from the library."""

import asyncio

from siet_platform import ai_helpers


def test_a_resolved_scope_never_falls_back_to_the_whole_workspace(monkeypatch):
    async def whole_workspace(**kwargs):
        raise AssertionError("searched every document in the workspace")

    calls = []

    async def scoped_search(query, notebook_ids, *, results=8, source_ids=None, **kwargs):
        calls.append((list(notebook_ids), source_ids))
        return [{"title": "บทที่ 1", "matches": ["mutex คือ ..."]}]

    monkeypatch.setattr(ai_helpers, "text_search", whole_workspace)
    monkeypatch.setattr("siet_platform.retrieval.search_in_notebooks", scoped_search)

    # "ไม่ใช้คลังความรู้" / nothing readable: no library at all
    assert asyncio.run(ai_helpers._retrieve_rag_context("mutex", [], scoped=True)) == ""
    # picked files: only those sources
    context = asyncio.run(ai_helpers._retrieve_rag_context("mutex", ["notebook:c1"], scoped=True, source_ids=["source:a"]))
    assert calls == [(["notebook:c1"], ["source:a"])] and "mutex" in context
