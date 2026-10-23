"""Turning the knowledge picker's choices into a retrieval scope."""

import asyncio
from types import SimpleNamespace

from siet_platform import http, library

USER = SimpleNamespace(id=1, role="student")


def _fake_library(monkeypatch, *, pick=None, docs=None):
    async def resolve_knowledge_pick(user, *, notebook_ids=None, source_ids=None):
        return pick

    async def scope_for_documents(user, document_ids):
        return docs

    monkeypatch.setattr(library, "resolve_knowledge_pick", resolve_knowledge_pick)
    monkeypatch.setattr(library, "scope_for_documents", scope_for_documents)


def _resolve(document_ids=(), notebook_ids=(), source_ids=()):
    return asyncio.run(http._resolve_pick(USER, list(document_ids), list(notebook_ids), list(source_ids)))


def test_nothing_picked_leaves_the_scope_to_the_caller(monkeypatch):
    _fake_library(monkeypatch)
    assert _resolve() is None


def test_several_documents_are_searched_together(monkeypatch):
    _fake_library(monkeypatch, docs={"notebook_ids": ["notebook:c1"], "source_ids": ["source:a", "source:b"]})
    assert _resolve(document_ids=[1, 2]) == (["notebook:c1"], ["source:a", "source:b"], "เอกสารที่เลือก 2 ฉบับ")


def test_documents_and_notebook_sources_are_combined(monkeypatch):
    _fake_library(
        monkeypatch,
        pick={"notebook_ids": ["notebook:t1"], "source_ids": ["source:t"], "label": "เอกสาร “บทที่ 1”"},
        docs={"notebook_ids": ["notebook:c1", "notebook:t1"], "source_ids": ["source:a"]},
    )
    assert _resolve(document_ids=[1], source_ids=["source:t"]) == (
        ["notebook:t1", "notebook:c1"],
        ["source:t", "source:a"],
        "เอกสารที่เลือก 2 ฉบับ",
    )


def test_a_whole_notebook_in_the_pick_cannot_be_narrowed_to_sources(monkeypatch):
    _fake_library(
        monkeypatch,
        pick={"notebook_ids": ["notebook:t1"], "source_ids": None, "label": "Notebook"},
        docs={"notebook_ids": ["notebook:c1"], "source_ids": ["source:a"]},
    )
    assert _resolve(document_ids=[1], notebook_ids=["notebook:t1"]) == (
        ["notebook:t1", "notebook:c1"],
        None,
        "เอกสารที่เลือก",
    )
