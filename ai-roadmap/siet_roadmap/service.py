"""
Project roadmap generation (ported from the standalone ai-roadmap app, same model pipeline).

- Validates and clamps inputs before hitting the LLM
- Caches results in Redis for 1 hour, keyed by (owner_id, prompt_hash), so user A
  cannot read user B's cached result
- Keeps only edges between real nodes and falls back to a sequential chain
- Surfaces a clean error envelope when no model is configured

Shared helpers (RAG context, model call, JSON extraction) live in
siet_platform.ai_helpers.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel

from siet_core.exceptions import ExternalServiceError, InvalidInputError
from siet_platform import usage
from siet_platform.ai_helpers import (
    _extract_json,
    _hash_prompt,
    _invoke_chat,
    _retrieve_rag_context,
)
from siet_platform.cache.service import cache_service
from siet_platform.config import DEFAULT_CACHE_TTL
from siet_roadmap.domain import RoadmapSession


# ---------------------------------------------------------------------------
# Pydantic response schemas – used to coerce the LLM JSON into a stable shape
# ---------------------------------------------------------------------------


class RoadmapNode(BaseModel):
    id: str
    label: str
    description: str = ""
    category: str = "general"
    order: int = 0


class RoadmapEdge(BaseModel):
    source: str
    target: str


class RoadmapResponse(BaseModel):
    title: str
    description: str
    nodes: List[RoadmapNode]
    edges: List[RoadmapEdge]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _enforce_roadmap_invariants(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Validate the roadmap shape and ensure edges reference real nodes."""
    nodes_raw = payload.get("nodes") or []
    if not isinstance(nodes_raw, list) or len(nodes_raw) < 3:
        raise ExternalServiceError("Roadmap needs at least 3 nodes")

    nodes: List[Dict[str, Any]] = []
    seen_ids = set()
    for index, raw in enumerate(nodes_raw, start=1):
        if not isinstance(raw, dict):
            continue
        node_id = (
            raw.get("id") or raw.get("label") or f"node_{index}"
        ).strip()
        if not node_id:
            node_id = f"node_{index}"
        if node_id in seen_ids:
            node_id = f"{node_id}_{index}"
        seen_ids.add(node_id)
        label = (raw.get("label") or raw.get("title") or node_id).strip()
        description = (raw.get("description") or raw.get("detail") or "").strip()
        category = (raw.get("category") or "general").strip().lower()
        try:
            order = int(raw.get("order") or index)
        except (TypeError, ValueError):
            order = index
        nodes.append(
            {
                "id": node_id,
                "label": label,
                "description": description,
                "category": category,
                "order": order,
            }
        )

    edges_raw = payload.get("edges") or []
    edges: List[Dict[str, str]] = []
    for raw in edges_raw:
        if not isinstance(raw, dict):
            continue
        source = (raw.get("source") or raw.get("from") or "").strip()
        target = (raw.get("target") or raw.get("to") or "").strip()
        if not source or not target:
            continue
        if source not in seen_ids or target not in seen_ids:
            continue
        if source == target:
            continue
        edges.append({"source": source, "target": target})

    if not edges and len(nodes) >= 2:
        # Build a sequential fallback so the visualisation is always meaningful
        for i in range(len(nodes) - 1):
            edges.append({"source": nodes[i]["id"], "target": nodes[i + 1]["id"]})

    return {
        "title": (payload.get("title") or "Untitled roadmap").strip(),
        "description": (payload.get("description") or "").strip(),
        "nodes": nodes,
        "edges": edges,
    }


# ---------------------------------------------------------------------------
# Public service API
# ---------------------------------------------------------------------------


async def generate_roadmap(
    owner_id: str,
    description: str,
    title: Optional[str] = None,
    language: str = "th",
    node_count: int = 15,
    notebook_id: Optional[str] = None,
    model_id: Optional[str] = None,
    report: Optional[Dict[str, Any]] = None,
    notebook_ids: Optional[List[str]] = None,
) -> RoadmapSession:
    """Generate a project roadmap and persist it for the owner.

    ``report`` (optional dict) receives ``{"cached": bool}`` so callers can
    tell whether an LLM call actually happened (used by the point wallet).
    """
    usage.set_context(feature="roadmap", user_id=owner_id if str(owner_id).isdigit() else None)
    if not owner_id:
        raise InvalidInputError("owner_id is required")
    description = (description or "").strip()
    if not description:
        raise InvalidInputError("Description is required")
    if node_count < 3 or node_count > 50:
        raise InvalidInputError("node_count must be between 3 and 50")

    rag_context = await _retrieve_rag_context(description, notebook_ids)
    cache_key_payload = {
        "desc": description.lower(),
        "n": node_count,
        "lang": language,
        "model": model_id or "default",
        "scope": ",".join(sorted(notebook_ids)) if notebook_ids else "global",
        "rag": _hash_prompt({"context": rag_context}) if rag_context else "none",
    }
    prompt_hash = _hash_prompt(cache_key_payload)
    cache_key = f"features:roadmap:{owner_id}:{prompt_hash}"

    cached = await cache_service.get_json(cache_key)
    if cached:
        logger.info(f"Roadmap cache HIT for {owner_id} ({prompt_hash})")
        if report is not None:
            report["cached"] = True
        return await _persist_roadmap(
            owner_id=owner_id,
            title=title or cached["payload"].get("title") or "Project Roadmap",
            description=description,
            language=language,
            node_count=node_count,
            notebook_id=notebook_id,
            model_id=model_id,
            prompt_hash=prompt_hash,
            payload=cached["payload"],
            cached=True,
        )

    system_prompt = (
        "You are a project planner. Always respond with a single JSON object "
        "matching the schema: "
        '{"title": str, "description": str, "nodes": [{"id": str, "label": str, '
        '"description": str, "category": str, "order": int}], '
        '"edges": [{"source": str, "target": str}]}. '
        "Nodes should be ordered from earliest to latest. Edges should reference "
        "existing node ids. Do not include any prose outside the JSON."
    )
    user_prompt = (
        f"Create a project roadmap with {node_count} nodes for the following "
        f"project description:\n\n{description}\n\n"
        f"Output language code: {language}. "
        "Suggested node categories: planning, design, development, testing, "
        "deployment, launch. Make sure edges form a directed acyclic graph."
        + (
            "\n\nUse the following retrieved course documents as the "
            "primary factual context and ground the roadmap in it:\n\n"
            + rag_context
            if rag_context
            else ""
        )
    )

    raw = await _invoke_chat(
        prompt=user_prompt,
        system=system_prompt,
        owner_id=owner_id,
        model_id=model_id,
    )
    parsed = await _extract_json(raw)
    clean = _enforce_roadmap_invariants(parsed)

    await cache_service.set_json(cache_key, {"payload": clean}, ttl=DEFAULT_CACHE_TTL)

    if report is not None:
        report["cached"] = False
    return await _persist_roadmap(
        owner_id=owner_id,
        title=title or clean.get("title") or "Project Roadmap",
        description=description,
        language=language,
        node_count=node_count,
        notebook_id=notebook_id,
        model_id=model_id,
        prompt_hash=prompt_hash,
        payload=clean,
        cached=False,
    )


async def _persist_roadmap(
    *,
    owner_id: str,
    title: str,
    description: str,
    language: str,
    node_count: int,
    notebook_id: Optional[str],
    model_id: Optional[str],
    prompt_hash: str,
    payload: Dict[str, Any],
    cached: bool,
) -> RoadmapSession:
    session = RoadmapSession(
        owner_id=owner_id,
        title=title,
        description=description,
        language=language,
        node_count=node_count,
        nodes=payload["nodes"],
        edges=payload["edges"],
        notebook_id=notebook_id,
        model_id=model_id,
        prompt_hash=prompt_hash,
    )
    await session.save()
    logger.info(
        f"Persisted roadmap session {session.id} for owner {owner_id} (cached={cached})"
    )
    return session
