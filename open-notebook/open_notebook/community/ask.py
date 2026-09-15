"""
"KMITL RAG AI" quick-ask.

A deliberately small RAG pipeline that matches the point-economy contract:

* retrieves at most **3 chunks** from the knowledge the caller may read
  (course libraries published by teachers + the caller's own uploads)
* asks the default chat model for a **150–300 word** answer with citations
* optionally carries a short conversation history (session mode)

When ``notebook_ids`` is given, retrieval is restricted to those notebooks
(that is how "ถามเฉพาะวิชานี้" / "ถามจากไฟล์ของฉัน" are implemented). With no
notebooks the search falls back to the whole workspace so the widget still
works before anybody has uploaded anything.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from loguru import logger

from open_notebook.community.retrieval import search_in_notebooks
from open_notebook.domain.notebook import text_search, vector_search
from open_notebook.features.service import _invoke_chat

MAX_CHUNKS = 3
MAX_CHUNK_CHARS = 1800


def _extract_snippet(result: Dict[str, Any]) -> str:
    raw_matches = result.get("matches") or []
    if isinstance(raw_matches, str):
        raw_matches = [raw_matches]
    content = "\n".join(str(m) for m in raw_matches if m)
    if not content:
        content = str(result.get("content") or result.get("text") or "")
    return content.strip()[:MAX_CHUNK_CHARS]


def _score(result: Dict[str, Any]) -> float:
    for key in ("similarity", "score", "relevance"):
        value = result.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


async def _search_notebooks(question: str, notebook_ids: Sequence[str]) -> List[Any]:
    """Search only the documents inside the given notebooks."""
    try:
        return await search_in_notebooks(question, notebook_ids, results=MAX_CHUNKS)
    except Exception as exc:
        logger.warning(f"quick-ask: scoped search failed: {exc}")
        return []


async def _search_global(question: str) -> List[Any]:
    try:
        return await vector_search(question, MAX_CHUNKS, source=True, note=True) or []
    except Exception as exc:
        logger.debug(f"quick-ask vector search unavailable ({exc}); trying text search")
    try:
        return await text_search(question, MAX_CHUNKS, source=True, note=True) or []
    except Exception as exc:
        logger.warning(f"quick-ask retrieval skipped: {exc}")
        return []


async def retrieve(
    question: str,
    notebook_ids: Optional[Sequence[str]] = None,
    *,
    allow_global_fallback: bool = True,
) -> List[Dict[str, Any]]:
    """
    Return up to MAX_CHUNKS citation dicts: {index, id, title, snippet, score}.

    When the caller picked an explicit scope (a course, their own files, one
    document) ``allow_global_fallback`` must be False – answering from the whole
    workspace would silently break the promise made in the UI.
    """
    results: List[Any] = []
    if notebook_ids:
        results = await _search_notebooks(question, notebook_ids)
        if not results and not allow_global_fallback:
            return []
    if not results and allow_global_fallback:
        results = await _search_global(question)

    citations: List[Dict[str, Any]] = []
    seen: set[str] = set()
    for item in results:
        if len(citations) >= MAX_CHUNKS:
            break
        if not isinstance(item, dict):
            continue
        snippet = _extract_snippet(item)
        if not snippet:
            continue
        key = snippet[:120]
        if key in seen:
            continue
        seen.add(key)
        citations.append(
            {
                "index": len(citations) + 1,
                "id": str(item.get("id") or item.get("parent_id") or ""),
                "title": str(item.get("title") or f"Knowledge item {len(citations) + 1}"),
                "snippet": snippet,
                "score": item.get("similarity") or item.get("score"),
            }
        )
    return citations


def _build_prompt(
    question: str,
    citations: List[Dict[str, Any]],
    history: Optional[List[Dict[str, str]]],
    language: str,
    scope_label: Optional[str],
) -> str:
    parts: List[str] = []
    if scope_label:
        parts.append(f"Knowledge scope chosen by the student: {scope_label}")
    if citations:
        parts.append("Retrieved knowledge (cite with [n]):")
        for c in citations:
            parts.append(f"[{c['index']}] {c['title']}\n{c['snippet']}")
    else:
        parts.append("Retrieved knowledge: (nothing relevant was found in the knowledge base)")

    if history:
        parts.append("Conversation so far:")
        for msg in history[-8:]:
            role = "Student" if msg.get("role") == "user" else "KMITL RAG AI"
            parts.append(f"{role}: {msg.get('content', '')}")

    parts.append(f"Answer language: {language}")
    parts.append(f"Question: {question}")
    return "\n\n".join(parts)


SYSTEM_PROMPT = (
    "You are 'KMITL RAG AI', the study assistant of SIET Space (KMITL). "
    "Answer the student's question using the retrieved knowledge first. "
    "Write 150-300 words, in the requested language, with clear structure. "
    "Cite the knowledge you used inline like [1] or [2]. "
    "If the retrieved knowledge does not cover the question, say so briefly and then "
    "answer from general knowledge, clearly marking it as not from the course library. "
    "Never invent citations."
)


async def quick_ask(
    *,
    owner_id: str,
    question: str,
    history: Optional[List[Dict[str, str]]] = None,
    language: str = "th",
    model_id: Optional[str] = None,
    notebook_ids: Optional[Sequence[str]] = None,
    scope_label: Optional[str] = None,
    allow_global_fallback: bool = True,
) -> Dict[str, Any]:
    question = (question or "").strip()
    if not question:
        raise ValueError("question is required")
    citations = await retrieve(
        question, notebook_ids, allow_global_fallback=allow_global_fallback
    )
    prompt = _build_prompt(question, citations, history, language, scope_label)
    answer = await _invoke_chat(
        prompt=prompt,
        system=SYSTEM_PROMPT,
        owner_id=owner_id,
        model_id=model_id,
    )
    return {"answer": answer.strip(), "citations": citations}
