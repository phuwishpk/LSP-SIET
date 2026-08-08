"""
Service layer for the bundled AI feature modules.

Provides:

- `generate_quiz` — multiple-choice quiz generation (ported from
  My-ai-quiz and now using Esperanto for multi-provider support)
- `generate_roadmap` — project roadmap generation (ported from
  ai-roadmap-generator using the same Esperanto pipeline)

Both services:

- Validate and clamp inputs before hitting the LLM
- Use Redis to cache results for 1 hour, keyed by (owner_id, prompt_hash)
  so user A cannot read user B's cached result
- Enforce the correct answer lives inside the options (anti-hallucination)
- Surface a clean error envelope when no model is configured
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, List, Optional

from loguru import logger
from pydantic import BaseModel, Field

from open_notebook.ai.models import model_manager
from open_notebook.cache.service import cache_service
from open_notebook.config import DEFAULT_CACHE_TTL
from open_notebook.exceptions import (
    ConfigurationError,
    ExternalServiceError,
    InvalidInputError,
)
from open_notebook.domain.features import QuizSession, RoadmapSession
from open_notebook.domain.notebook import text_search
from open_notebook.utils.text_utils import extract_text_content


MAX_RAG_CONTEXT_CHARS = 12_000


# ---------------------------------------------------------------------------
# Pydantic response schemas – used to coerce the LLM JSON into a stable shape
# ---------------------------------------------------------------------------


class QuizOption(BaseModel):
    text: str
    is_correct: bool = False


class QuizQuestion(BaseModel):
    id: int
    question: str
    options: List[QuizOption]
    correct_answer: str
    explanation: str


class QuizResponse(BaseModel):
    topic: str
    language: str
    questions: List[QuizQuestion]


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


def _hash_prompt(payload: Dict[str, Any]) -> str:
    """Stable content hash for cache-key derivation."""
    encoded = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()[:16]


async def _retrieve_rag_context(query: str) -> str:
    """Retrieve relevant Open Notebook source/note snippets for every feature."""
    try:
        results = await text_search(
            keyword=query,
            results=8,
            source=True,
            note=True,
        )
    except Exception as exc:
        # Empty/new workspaces must still be able to generate features.
        logger.warning(f"RAG retrieval skipped for {query!r}: {exc}")
        return ""

    chunks: List[str] = []
    for index, result in enumerate(results or [], start=1):
        if not isinstance(result, dict):
            continue
        title = str(result.get("title") or f"Knowledge item {index}")
        raw_matches = result.get("matches") or []
        if isinstance(raw_matches, str):
            raw_matches = [raw_matches]
        content = "\n".join(str(match) for match in raw_matches if match)
        if not content:
            content = str(result.get("content") or result.get("text") or "")
        if content.strip():
            chunks.append(f"[Open Notebook: {title}]\n{content.strip()}")

    return "\n\n".join(chunks)[:MAX_RAG_CONTEXT_CHARS]


async def _extract_json(raw: str) -> Dict[str, Any]:
    """Find the first JSON object inside an LLM response string."""
    if not raw:
        raise ExternalServiceError("LLM returned an empty response")

    text = raw.strip()
    # Strip optional ```json fences
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()

    # Find the first balanced JSON object
    decoder = json.JSONDecoder()
    idx = text.find("{")
    while idx != -1:
        try:
            return decoder.decode(text[idx:])
        except json.JSONDecodeError:
            idx = text.find("{", idx + 1)
    raise ExternalServiceError("LLM response did not contain valid JSON")


async def _invoke_chat(
    prompt: str,
    system: str,
    owner_id: str,
    default_type: str = "chat",
    model_id: Optional[str] = None,
) -> str:
    """Single entry point that talks to whichever provider the user configured."""
    try:
        if model_id:
            model = await model_manager.get_model(model_id)
        else:
            model = await model_manager.get_default_model(default_type)
    except Exception as exc:
        logger.error(f"Failed resolving model for feature: {exc}")
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    if model is None:
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )

    try:
        # Build the prompt as a single string, matching the convention used by
        # the rest of open-notebook (see open_notebook/graphs/ask.py).
        prompt = f"{system}\n\n{prompt}"
        ai_message = await model.ainvoke(prompt)
        return extract_text_content(ai_message.content)
    except Exception as exc:
        logger.exception(f"LLM call failed for owner {owner_id}: {exc}")
        raise ExternalServiceError(f"LLM call failed: {exc}")


def _enforce_quiz_invariants(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Defense-in-depth: make sure the LLM didn't drift from the schema."""
    raw_questions = payload.get("questions") or []
    if not isinstance(raw_questions, list) or not raw_questions:
        raise ExternalServiceError("LLM produced no questions")

    cleaned: List[Dict[str, Any]] = []
    for index, raw in enumerate(raw_questions, start=1):
        if not isinstance(raw, dict):
            raise ExternalServiceError("Question entry is not an object")

        question_text = (raw.get("question") or raw.get("text") or "").strip()
        options_raw = raw.get("options") or []
        if not isinstance(options_raw, list):
            raise ExternalServiceError("Options must be a list")

        options: List[Dict[str, str]] = []
        for option in options_raw:
            if isinstance(option, str):
                options.append({"text": option.strip(), "is_correct": False})
            elif isinstance(option, dict):
                text = (option.get("text") or option.get("option") or "").strip()
                is_correct = bool(option.get("is_correct", False))
                if not text:
                    continue
                options.append({"text": text, "is_correct": is_correct})

        if len(options) != 4:
            raise ExternalServiceError(
                f"Question #{index} must have exactly 4 options, got {len(options)}"
            )

        # Resolve the correct answer
        correct = (raw.get("correct_answer") or raw.get("correctAnswer") or "").strip()
        if not correct:
            # Fall back to whichever option is marked is_correct
            for option in options:
                if option.get("is_correct"):
                    correct = option["text"]
                    break
        if not correct:
            raise ExternalServiceError(
                f"Question #{index} has no correct answer"
            )

        # Make sure the correct answer is actually one of the options
        normalized = {option["text"].strip(): option for option in options}
        if correct not in normalized:
            # Try to handle the case where LLM returned the *text* of an option
            match = next(
                (
                    option["text"]
                    for option in options
                    if option["text"].strip().lower() == correct.lower()
                ),
                None,
            )
            if match is None:
                raise ExternalServiceError(
                    f"Question #{index}: correct_answer is not in options"
                )
            correct = match

        explanation = (raw.get("explanation") or "").strip()
        if not explanation:
            explanation = "No explanation provided."

        cleaned.append(
            {
                "id": int(raw.get("id") or index),
                "question": question_text,
                "options": options,
                "correct_answer": correct,
                "explanation": explanation,
            }
        )

    return {"questions": cleaned}


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


async def generate_quiz(
    owner_id: str,
    topic: str,
    question_count: int = 5,
    language: str = "th",
    notebook_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> QuizSession:
    """Generate a multiple-choice quiz and persist it for the owner."""
    if not owner_id:
        raise InvalidInputError("owner_id is required")
    topic = (topic or "").strip()
    if not topic:
        raise InvalidInputError("Topic is required")
    if question_count < 1 or question_count > 20:
        raise InvalidInputError("question_count must be between 1 and 20")

    rag_context = await _retrieve_rag_context(topic)
    cache_key_payload = {
        "topic": topic.lower(),
        "n": question_count,
        "lang": language,
        "model": model_id or "default",
        "rag": _hash_prompt({"context": rag_context}) if rag_context else "none",
    }
    prompt_hash = _hash_prompt(cache_key_payload)
    cache_key = f"features:quiz:{owner_id}:{prompt_hash}"

    cached = await cache_service.get_json(cache_key)
    if cached:
        logger.info(f"Quiz cache HIT for {owner_id} ({prompt_hash})")
        return await _persist_quiz(
            owner_id=owner_id,
            topic=topic,
            language=language,
            question_count=question_count,
            notebook_id=notebook_id,
            model_id=model_id,
            prompt_hash=prompt_hash,
            payload=cached["payload"],
            cached=True,
        )

    system_prompt = (
        "You are a quiz generator. Always respond with a single JSON object "
        "matching the schema: "
        '{"questions": [{"id": int, "question": str, "options": [{"text": str, '
        '"is_correct": bool}], "correct_answer": str, "explanation": str}]}. '
        "Each question must have exactly 4 options. The correct_answer must be "
        "the exact text of one option. Do not include any prose outside the JSON."
    )
    user_prompt = (
        f"Generate a {question_count}-question multiple-choice quiz about "
        f'"{topic}". Output language code: {language}. '
        "Each question must have 4 options, exactly one correct, and a short "
        "explanation citing the rationale. Mark the correct option with "
        "is_correct: true and repeat its text in correct_answer."
        + (
            "\n\nUse the following retrieved Open Notebook knowledge as the "
            "primary factual context. Do not invent facts that conflict with it:\n\n"
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
    clean = _enforce_quiz_invariants(parsed)

    await cache_service.set_json(cache_key, {"payload": clean}, ttl=DEFAULT_CACHE_TTL)

    return await _persist_quiz(
        owner_id=owner_id,
        topic=topic,
        language=language,
        question_count=question_count,
        notebook_id=notebook_id,
        model_id=model_id,
        prompt_hash=prompt_hash,
        payload=clean,
        cached=False,
    )


async def _persist_quiz(
    *,
    owner_id: str,
    topic: str,
    language: str,
    question_count: int,
    notebook_id: Optional[str],
    model_id: Optional[str],
    prompt_hash: str,
    payload: Dict[str, Any],
    cached: bool,
) -> QuizSession:
    session = QuizSession(
        owner_id=owner_id,
        topic=topic,
        language=language,
        question_count=question_count,
        questions=payload["questions"],
        notebook_id=notebook_id,
        model_id=model_id,
        prompt_hash=prompt_hash,
    )
    await session.save()
    logger.info(
        f"Persisted quiz session {session.id} for owner {owner_id} (cached={cached})"
    )
    return session


async def generate_roadmap(
    owner_id: str,
    description: str,
    title: Optional[str] = None,
    language: str = "th",
    node_count: int = 15,
    notebook_id: Optional[str] = None,
    model_id: Optional[str] = None,
) -> RoadmapSession:
    """Generate a project roadmap and persist it for the owner."""
    if not owner_id:
        raise InvalidInputError("owner_id is required")
    description = (description or "").strip()
    if not description:
        raise InvalidInputError("Description is required")
    if node_count < 3 or node_count > 50:
        raise InvalidInputError("node_count must be between 3 and 50")

    rag_context = await _retrieve_rag_context(description)
    cache_key_payload = {
        "desc": description.lower(),
        "n": node_count,
        "lang": language,
        "model": model_id or "default",
        "rag": _hash_prompt({"context": rag_context}) if rag_context else "none",
    }
    prompt_hash = _hash_prompt(cache_key_payload)
    cache_key = f"features:roadmap:{owner_id}:{prompt_hash}"

    cached = await cache_service.get_json(cache_key)
    if cached:
        logger.info(f"Roadmap cache HIT for {owner_id} ({prompt_hash})")
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
            "\n\nUse the following retrieved Open Notebook knowledge as the "
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
