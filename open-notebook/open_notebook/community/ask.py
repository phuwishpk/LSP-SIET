"""
"KMITL RAG AI" quick-ask.

A deliberately small RAG pipeline that matches the point-economy contract:

* retrieves at most **3 chunks** from the Open Notebook knowledge base
  (vector search when an embedding model exists, keyword search otherwise)
* asks the default chat model for a **150–300 word** answer with citations
* optionally carries a short conversation history (session mode)
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger

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


async def retrieve(question: str) -> List[Dict[str, Any]]:
    """Return up to MAX_CHUNKS citation dicts: {index, id, title, snippet, score}."""
    results: List[Any] = []
    try:
        results = await vector_search(question, MAX_CHUNKS, source=True, note=True) or []
    except Exception as exc:  # no embedding model / empty index → keyword fallback
        logger.debug(f"quick-ask vector search unavailable ({exc}); falling back to text search")
        try:
            results = await text_search(question, MAX_CHUNKS, source=True, note=True) or []
        except Exception as exc2:
            logger.warning(f"quick-ask retrieval skipped: {exc2}")
            results = []

    citations: List[Dict[str, Any]] = []
    for index, item in enumerate(results[:MAX_CHUNKS], start=1):
        if not isinstance(item, dict):
            continue
        snippet = _extract_snippet(item)
        if not snippet:
            continue
        citations.append(
            {
                "index": index,
                "id": str(item.get("id") or item.get("parent_id") or ""),
                "title": str(item.get("title") or f"Knowledge item {index}"),
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
) -> str:
    parts: List[str] = []
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
) -> Dict[str, Any]:
    question = (question or "").strip()
    if not question:
        raise ValueError("question is required")
    citations = await retrieve(question)
    prompt = _build_prompt(question, citations, history, language)
    answer = await _invoke_chat(
        prompt=prompt,
        system=SYSTEM_PROMPT,
        owner_id=owner_id,
        model_id=model_id,
    )
    return {"answer": answer.strip(), "citations": citations}
