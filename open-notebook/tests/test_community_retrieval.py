"""
Retrieval for the community RAG ("KMITL RAG AI").

Regression: the curriculum PDF had every chunk embedded three times, so "top 3"
was one paragraph three times and the model answered from a single 789-character
passage while claiming the document did not cover the question.
"""

import pytest

from open_notebook.community import ask
from open_notebook.community.retrieval import content_key, dedupe_hits


def hit(content, similarity, kind="chunk", id_="source:a", title="doc"):
    return {"id": id_, "title": title, "content": content, "matches": [content],
            "similarity": similarity, "kind": kind}


def test_content_key_ignores_whitespace_only():
    assert content_key("หลักสูตร  ค.อ.บ.\n เทคโนโลยี") == content_key(" หลักสูตร ค.อ.บ. เทคโนโลยี ")
    assert content_key("page 1 body") != content_key("page 2 body")


def test_dedupe_keeps_one_copy_best_first():
    hits = [hit("intro", 0.767), hit("intro", 0.767), hit("intro", 0.767),
            hit("careers", 0.755), hit("careers", 0.755), hit("summary", 0.747, "insight")]
    out = dedupe_hits(hits)
    assert [h["content"] for h in out] == ["intro", "careers", "summary"]
    assert [h["similarity"] for h in out] == sorted((h["similarity"] for h in out), reverse=True)


def test_pages_sharing_a_running_header_stay_separate():
    header = "หลักสูตรครุศาสตร์อุตสาหกรรมบัณฑิต สาขาวิชาเทคโนโลยีคอมพิวเตอร์ (หลักสูตรปรับปรุง พ.ศ. 2567) " * 3
    out = dedupe_hits([hit(header + "หมวดวิชาเฉพาะ", 0.7), hit(header + "หมวดวิชาศึกษาทั่วไป", 0.69)])
    assert len(out) == 2


@pytest.mark.asyncio
async def test_retrieve_gives_the_model_distinct_passages(monkeypatch):
    async def fake_search(question, notebook_ids, source_ids=None):
        # what search_in_notebooks returns after its own dedupe: distinct, best first
        return [hit(f"passage {i} " + "x" * 50, 0.8 - i / 100) for i in range(10)]

    monkeypatch.setattr(ask, "_search_notebooks", fake_search)
    cites = await ask.retrieve("q", ["notebook:n"], allow_global_fallback=False)
    assert len(cites) == ask.MAX_CHUNKS
    assert [c["index"] for c in cites] == list(range(1, ask.MAX_CHUNKS + 1))
    assert len({c["snippet"] for c in cites}) == ask.MAX_CHUNKS


@pytest.mark.asyncio
async def test_retrieve_drops_duplicates_that_reach_it(monkeypatch):
    async def fake_search(question, notebook_ids, source_ids=None):
        return [hit("same passage", 0.77)] * 3 + [hit("another passage", 0.75)]

    monkeypatch.setattr(ask, "_search_notebooks", fake_search)
    cites = await ask.retrieve("q", ["notebook:n"], allow_global_fallback=False)
    assert [c["snippet"] for c in cites] == ["same passage", "another passage"]


@pytest.mark.asyncio
async def test_single_document_pick_always_includes_its_summary(monkeypatch):
    async def fake_search(question, notebook_ids, source_ids=None):
        return [hit(f"intro-like passage {i}", 0.8 - i / 100) for i in range(8)]

    async def fake_summaries(source_ids, limit=1):
        return [hit("DENSE SUMMARY " * 300, 0.0, "insight", "source_insight:s", "Dense Summary · doc")]

    monkeypatch.setattr(ask, "_search_notebooks", fake_search)
    monkeypatch.setattr(ask, "source_summaries", fake_summaries)
    cites = await ask.retrieve("q", ["notebook:n"], allow_global_fallback=False, source_ids=["source:a"])
    assert len(cites) == ask.MAX_CHUNKS
    summary = [c for c in cites if c["title"].startswith("Dense Summary")]
    assert len(summary) == 1
    # summaries keep far more text than an ordinary chunk
    assert len(summary[0]["snippet"]) > ask.MAX_CHUNK_CHARS
    assert len(summary[0]["snippet"]) <= ask.MAX_INSIGHT_CHARS


@pytest.mark.asyncio
async def test_no_summary_lookup_when_one_already_ranked(monkeypatch):
    calls = []

    async def fake_search(question, notebook_ids, source_ids=None):
        return [hit("p1", 0.8), hit("overview", 0.79, "insight"), hit("p2", 0.7)]

    async def fake_summaries(source_ids, limit=1):
        calls.append(source_ids)
        return []

    monkeypatch.setattr(ask, "_search_notebooks", fake_search)
    monkeypatch.setattr(ask, "source_summaries", fake_summaries)
    cites = await ask.retrieve("q", ["notebook:n"], allow_global_fallback=False, source_ids=["source:a"])
    assert calls == [] and len(cites) == 3


@pytest.mark.asyncio
async def test_explicit_scope_with_nothing_found_does_not_fall_back(monkeypatch):
    async def nothing(question, notebook_ids, source_ids=None):
        return []

    async def global_search(question):
        raise AssertionError("must not search the whole workspace for an explicit pick")

    monkeypatch.setattr(ask, "_search_notebooks", nothing)
    monkeypatch.setattr(ask, "_search_global", global_search)
    assert await ask.retrieve("q", ["notebook:n"], allow_global_fallback=False, source_ids=["source:a"]) == []


@pytest.mark.asyncio
async def test_summary_query_selects_the_field_it_orders_by(monkeypatch):
    """SurrealDB rejects ORDER BY on an unselected field; that failure was swallowed
    and the document summary silently never reached the model."""
    import re

    from open_notebook.community import retrieval

    seen = {}

    async def fake_query(query, params=None):
        seen["query"] = " ".join(query.split())
        return [{"id": "source_insight:1", "insight_type": "Dense Summary",
                 "content": "overview", "created": "2026-08-09", "source_title": "doc.pdf"}]

    monkeypatch.setattr(retrieval, "repo_query", fake_query)
    out = await retrieval.source_summaries(["source:abc"], limit=1)

    selected = seen["query"].split(" FROM ")[0]
    for field in re.findall(r"ORDER BY (\w+)", seen["query"]):
        assert re.search(rf"\b{field}\b", selected), f"{field} is ordered by but not selected"
    assert out[0]["kind"] == "insight" and out[0]["title"] == "Dense Summary · doc.pdf"
