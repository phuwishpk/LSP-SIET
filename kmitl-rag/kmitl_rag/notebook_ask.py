"""
Notebook-scoped RAG Q&A: the user names notebooks (by id or name), each one
gets its own labelled context block, and the workspace is searched only when
none of them answers. Served by kmitl_rag.routers.notebook_ask.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel

from open_notebook.ai.models import model_manager
from open_notebook.database.repository import repo_query
from open_notebook.domain.notebook import Notebook, text_search
from open_notebook.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
    RateLimitError,
)
from open_notebook.utils.text_utils import extract_text_content
from siet_platform import throttle, usage
from siet_platform.retrieval import vector_search_in_notebook


# ---------------------------------------------------------------------------
# notebook_ask – notebook-scoped RAG Q&A
# ---------------------------------------------------------------------------

MAX_NOTEBOOK_ASK_REF_CHARS = 10_000   # per-notebook chunk budget
MAX_GLOBAL_FALLBACK_CHARS = 6_000      # global fallback budget


class NotebookContextBlock(BaseModel):
    """One labelled RAG block for a single notebook."""

    notebook_id: str
    notebook_name: str
    chunks: List[str]      # individual matched snippets
    total_chars: int
    # Phase 2: composite knowledge_version for the notebook + its sources.
    # The answer cache includes this in its fingerprint so that any doc
    # edit automatically scopes the cache to the current version.
    knowledge_version: int = 0


class ResolvedNotebooks(BaseModel):
    """Notebooks that were successfully resolved server-side."""

    resolved: List[NotebookContextBlock] = []
    failed_refs: List[str] = []          # refs that couldn't be found
    global_fallback_used: bool = False
    global_fallback_chunks: List[str] = []
    out_of_rag: bool = False            # True when no RAG whatsoever
    # Phase 2: rollup knowledge version used by the answer cache
    # fingerprint. Defaults to 0 so older callers (and tests) keep
    # working without changes.
    knowledge_version: int = 0


async def _resolve_notebook_refs(
    owner_id: str,
    refs: List[str],
) -> tuple[List[Notebook], List[str]]:
    """
    Resolve a list of raw refs (record IDs or @slug-name strings) to
    Notebook objects.

    Notebooks are global (no owner_id), so resolution is by record ID or
    name. Max 3 notebooks are returned; any refs beyond the first 3 are
    treated as failed.

    Args:
        owner_id: Ignored for notebooks (kept for API signature parity).
        refs: List of record IDs or @slug strings.

    Returns:
        (resolved_notebooks, failed_refs)
    """
    if not refs:
        return [], []

    # Strip leading @ and collect slugs separately from raw ids
    slug_map: Dict[str, str] = {}   # lowercased slug → original @ref
    raw_ids: List[str] = []
    for ref in refs[:3]:          # cap at 3
        ref = ref.strip()
        if ref.startswith("@"):
            slug_map[ref[1:].lower()] = ref      # keep original for error messages
        else:
            raw_ids.append(ref)

    notebooks: List[Notebook] = []
    # Anything beyond index 3 in the original list is auto-fail
    failed_refs: List[str] = list(refs[3:])

    # --- Resolve by record ID ---
    for raw in raw_ids:
        try:
            nb = await Notebook.get(raw)
            if nb:
                notebooks.append(nb)
            else:
                failed_refs.append(raw)
        except Exception:
            failed_refs.append(raw)

    # --- Resolve by @slug (name match) ---
    if slug_map:
        slug_list = list(slug_map.keys())
        try:
            rows = await repo_query(
                "SELECT * FROM notebook WHERE string::lowercase(name) IN $slugs LIMIT $limit",
                {"slugs": slug_list, "limit": len(slug_list)},
            )
        except Exception as exc:
            logger.warning(f"Slug lookup query failed: {exc}")
            rows = []
            for slug in slug_map:
                failed_refs.append(f"@{slug}")

        for row in rows:
            try:
                nb = Notebook(**row)
                notebooks.append(nb)
            except Exception:
                pass

    # De-duplicate by id, preserving order, cap at 3
    seen: set = set()
    unique: List[Notebook] = []
    for nb in notebooks:
        if nb.id and nb.id not in seen:
            seen.add(nb.id)
            unique.append(nb)

    return unique[:3], failed_refs


def _results_to_chunks(
    results: List[Dict[str, Any]],
    max_chars: int = MAX_NOTEBOOK_ASK_REF_CHARS,
) -> List[str]:
    """Flatten a list of search results into individual text chunks."""
    chunks: List[str] = []
    for result in results:
        if not isinstance(result, dict):
            continue
        title = str(result.get("title") or "")
        raw_matches = result.get("matches") or []
        if isinstance(raw_matches, str):
            raw_matches = [raw_matches]
        for match in raw_matches:
            text = str(match).strip()
            if text:
                chunks.append(f"[{title}] {text}" if title else text)
    return chunks


def _build_notebook_ask_prompt(
    question: str,
    resolved_notebooks: List[NotebookContextBlock],
    global_chunks: List[str],
    language: str,
    include_original: bool = False,
) -> str:
    """
    Build the final user prompt with weighted notebook sections.

    Each notebook gets its own labelled block so the model can
    attribute and compare across sources.
    """
    parts: List[str] = []

    for block in resolved_notebooks:
        combined = "\n".join(block.chunks)
        if len(combined) > MAX_NOTEBOOK_ASK_REF_CHARS:
            combined = combined[:MAX_NOTEBOOK_ASK_REF_CHARS]
        parts.append(
            f"## Notebook: {block.notebook_name}\n{combined}"
        )

    if global_chunks:
        combined = "\n".join(global_chunks)
        if len(combined) > MAX_GLOBAL_FALLBACK_CHARS:
            combined = combined[:MAX_GLOBAL_FALLBACK_CHARS]
        parts.append(
            f"## Global knowledge (fallback)\n{combined}"
        )

    context = "\n\n".join(parts)

    if include_original:
        out_of_rag_note = (
            "\n\n(out of RAG source): the answer below comes from the language "
            "model's own knowledge and not from any retrieved document."
        )
    else:
        out_of_rag_note = ""

    return (
        f"Answer the following question in language code '{language}'.\n\n"
        f"Use the retrieved context below to ground your answer. "
        f"If the context does not contain the answer, say so.\n\n"
        f"{context}"
        f"{out_of_rag_note}"
        f"\n\nQuestion: {question}"
    )


async def _invoke_direct_answer(
    question: str,
    language: str,
    owner_id: str,
    model_id: Optional[str] = None,
) -> str:
    """Call the final-answer model directly with no RAG context."""
    try:
        if model_id:
            model = await model_manager.get_model(model_id)
        else:
            model = await model_manager.get_default_model("chat")
    except Exception:
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )
    if model is None:
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    system_prompt = (
        "You are a helpful assistant. Always answer in the requested language. "
        "If you do not know the answer, say so clearly."
    )
    user_prompt = (
        f"(out of RAG source): answer the following question using only your "
        f"own knowledge. Language: {language}.\n\nQuestion: {question}"
    )
    try:
        with usage.Timer() as timer:
            ai_message = await throttle.run(
                "chat", lambda: model.ainvoke(f"{system_prompt}\n\n{user_prompt}"), label="direct"
            )
        await usage.record(
            kind=usage.KIND_CHAT,
            model=getattr(model, "model_name", None) or getattr(model, "model", None),
            provider=getattr(model, "provider", None),
            latency_ms=timer.ms,
            feature="direct",
            user_id=owner_id,
            **usage.chat_usage_from_message(ai_message),
        )
        return extract_text_content(ai_message.content)
    except (throttle.ProviderBusy, RateLimitError):
        raise
    except Exception as exc:
        logger.exception(f"Direct LLM call failed for owner {owner_id}: {exc}")
        raise ExternalServiceError(f"LLM call failed: {exc}")


async def notebook_ask(
    owner_id: str,
    question: str,
    notebook_refs: List[str],
    language: str = "th",
    strategy_model_id: Optional[str] = None,
    answer_model_id: Optional[str] = None,
    final_model_id: Optional[str] = None,
) -> ResolvedNotebooks:
    """
    Answer a question scoped to specific notebooks.

    This function does NOT stream – it returns the resolved notebook metadata
    plus an ``out_of_rag`` flag so the caller can decide how to surface
    the answer (direct stream or out-of-RAG label).

    The streaming logic lives in the router (``search.py``) which calls
    ``_stream_notebook_ask`` directly.

    Args:
        owner_id:          Authenticated owner identifier.
        question:          The user's question.
        notebook_refs:     List of notebook record IDs or ``@slug`` strings.
        language:          BCP-47 language code.
        strategy_model_id: Override for the strategy (query-planning) model.
        answer_model_id:   Override for the per-chunk answer model.
        final_model_id:    Override for the final-answer model.

    Returns:
        ResolvedNotebooks with context blocks and fallback metadata.
    """
    if not owner_id:
        raise InvalidInputError("owner_id is required")
    question = (question or "").strip()
    if not question:
        raise InvalidInputError("Question cannot be empty")

    # 1. Resolve notebook refs
    notebooks, failed_refs = await _resolve_notebook_refs(owner_id, notebook_refs)

    # 2. Per-notebook vector search
    resolved_blocks: List[NotebookContextBlock] = []
    any_hit = False
    for nb in notebooks:
        try:
            results = await vector_search_in_notebook(
                keyword=question,
                notebook_id=str(nb.id),
                results=6,
                source=True,
                note=True,
                minimum_score=0.2,
            )
        except Exception as exc:
            logger.warning(f"vector_search_in_notebook failed for {nb.id}: {exc}")
            results = []

        chunks = _results_to_chunks(results)
        if chunks:
            any_hit = True
        # Phase 2: compute the composite knowledge version for this notebook
        # so the answer cache can scope appropriately.
        try:
            from siet_platform.cache.invalidation import (
                compute_notebook_knowledge_version,
            )

            nb_kv = await compute_notebook_knowledge_version(str(nb.id))
        except Exception:
            nb_kv = int(getattr(nb, "knowledge_version", 0) or 0)
        resolved_blocks.append(
            NotebookContextBlock(
                notebook_id=str(nb.id),
                notebook_name=nb.name,
                chunks=chunks,
                total_chars=sum(len(c) for c in chunks),
                knowledge_version=nb_kv,
            )
        )

    # 3. Global fallback (second tier)
    global_chunks: List[str] = []
    global_fallback_used = False
    if not any_hit:
        try:
            global_results = await text_search(
                keyword=question,
                results=6,
                source=True,
                note=True,
            )
        except Exception as exc:
            logger.warning(f"Global text_search fallback failed: {exc}")
            global_results = []
        global_chunks = _results_to_chunks(global_results, max_chars=MAX_GLOBAL_FALLBACK_CHARS)
        global_fallback_used = bool(global_chunks)

    # 4. out_of_rag flag
    out_of_rag = not any_hit and not global_chunks

    # Phase 2: rollup knowledge version for the whole scope. We pick the
    # max version of any contributing notebook so a single doc edit
    # propagates to the answer cache fingerprint.
    if resolved_blocks:
        scope_kv = max((b.knowledge_version for b in resolved_blocks), default=0)
    else:
        scope_kv = 0

    return ResolvedNotebooks(
        resolved=resolved_blocks,
        failed_refs=failed_refs,
        global_fallback_used=global_fallback_used,
        global_fallback_chunks=global_chunks,
        out_of_rag=out_of_rag,
        knowledge_version=scope_kv,
    )
