import json
import time
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from langchain_core.runnables import RunnableConfig
from loguru import logger

from api.models import (
    AskRequest,
    AskResponse,
    NotebookAskRequest,
    NotebookAskResolvedResponse,
    NotebookContextBlockPayload,
    SearchRequest,
    SearchResponse,
)
from open_notebook.ai.models import Model, model_manager
from open_notebook.cache.answer_cache import (
    context_fingerprint,
    get_cached_answer,
    set_cached_answer,
)
from open_notebook.cache.metrics import cache_metrics
from open_notebook.domain.notebook import text_search, vector_search
from open_notebook.exceptions import DatabaseOperationError, InvalidInputError
from open_notebook.features.service import (
    _build_notebook_ask_prompt,
    _invoke_direct_answer,
    notebook_ask,
)
from open_notebook.graphs.ask import graph as ask_graph
from open_notebook.utils.text_utils import extract_text_content

router = APIRouter()

# ---------------------------------------------------------------------------
# Owner resolution (mirrors features.py pattern)
# ---------------------------------------------------------------------------

DEFAULT_OWNER_ID = "default"


def _resolve_owner_id(
    request: Request,
    x_owner_id: Optional[str] = Header(default=None, alias="X-Owner-Id"),
) -> str:
    """
    Read the per-user identifier from the request.

    Priority:
      1. ``X-Owner-Id`` header supplied by the caller
      2. ``request.state.owner_id`` populated by the auth middleware
      3. ``"default"`` so legacy single-user setups keep working
    """
    header_value = (x_owner_id or "").strip()
    if header_value:
        return header_value
    state_owner = getattr(request.state, "owner_id", None)
    if state_owner:
        return str(state_owner)
    return DEFAULT_OWNER_ID

router = APIRouter()


@router.post("/search", response_model=SearchResponse)
async def search_knowledge_base(search_request: SearchRequest):
    """Search the knowledge base using text or vector search."""
    try:
        if search_request.type == "vector":
            # Check if embedding model is available for vector search
            if not await model_manager.get_embedding_model():
                raise HTTPException(
                    status_code=400,
                    detail="Vector search requires an embedding model. Please configure one in the Models section.",
                )

            results = await vector_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.search_notes,
                minimum_score=search_request.minimum_score,
            )
        else:
            # Text search
            results = await text_search(
                keyword=search_request.query,
                results=search_request.limit,
                source=search_request.search_sources,
                note=search_request.search_notes,
            )

        return SearchResponse(
            results=results or [],
            total_count=len(results) if results else 0,
            search_type=search_request.type,
        )

    except InvalidInputError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DatabaseOperationError as e:
        logger.error(f"Database error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    except Exception as e:
        logger.error(f"Unexpected error during search: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


async def stream_ask_response(
    question: str, strategy_model: Model, answer_model: Model, final_answer_model: Model
) -> AsyncGenerator[str, None]:
    """Stream the ask response as Server-Sent Events."""
    try:
        final_answer = None

        async for chunk in ask_graph.astream(
            input=dict(question=question),  # type: ignore[arg-type]
            config=dict(
                configurable=dict(
                    strategy_model=strategy_model.id,
                    answer_model=answer_model.id,
                    final_answer_model=final_answer_model.id,
                )
            ),
            stream_mode="updates",
        ):
            if "agent" in chunk:
                strategy_data = {
                    "type": "strategy",
                    "reasoning": chunk["agent"]["strategy"].reasoning,
                    "searches": [
                        {"term": search.term, "instructions": search.instructions}
                        for search in chunk["agent"]["strategy"].searches
                    ],
                }
                yield f"data: {json.dumps(strategy_data)}\n\n"

            elif "provide_answer" in chunk:
                for answer in chunk["provide_answer"]["answers"]:
                    answer_data = {"type": "answer", "content": answer}
                    yield f"data: {json.dumps(answer_data)}\n\n"

            elif "write_final_answer" in chunk:
                final_answer = chunk["write_final_answer"]["final_answer"]
                final_data = {"type": "final_answer", "content": final_answer}
                yield f"data: {json.dumps(final_data)}\n\n"

        # Send completion signal
        completion_data = {"type": "complete", "final_answer": final_answer}
        yield f"data: {json.dumps(completion_data)}\n\n"

    except Exception as e:
        from open_notebook.utils.error_classifier import classify_error

        _, user_message = classify_error(e)
        logger.error(f"Error in ask streaming: {str(e)}")
        error_data = {"type": "error", "message": user_message}
        yield f"data: {json.dumps(error_data)}\n\n"


@router.post("/search/ask")
async def ask_knowledge_base(ask_request: AskRequest):
    """Ask the knowledge base a question using AI models."""
    try:
        # Validate models exist
        strategy_model = await Model.get(ask_request.strategy_model)
        answer_model = await Model.get(ask_request.answer_model)
        final_answer_model = await Model.get(ask_request.final_answer_model)

        if not strategy_model:
            raise HTTPException(
                status_code=400,
                detail=f"Strategy model {ask_request.strategy_model} not found",
            )
        if not answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Answer model {ask_request.answer_model} not found",
            )
        if not final_answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Final answer model {ask_request.final_answer_model} not found",
            )

        # Check if embedding model is available
        if not await model_manager.get_embedding_model():
            raise HTTPException(
                status_code=400,
                detail="Ask feature requires an embedding model. Please configure one in the Models section.",
            )

        # For streaming response
        return StreamingResponse(
            stream_ask_response(
                ask_request.question, strategy_model, answer_model, final_answer_model
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ask operation failed: {str(e)}")


@router.post("/search/ask/simple", response_model=AskResponse)
async def ask_knowledge_base_simple(ask_request: AskRequest):
    """Ask the knowledge base a question and return a simple response (non-streaming)."""
    try:
        # Validate models exist
        strategy_model = await Model.get(ask_request.strategy_model)
        answer_model = await Model.get(ask_request.answer_model)
        final_answer_model = await Model.get(ask_request.final_answer_model)

        if not strategy_model:
            raise HTTPException(
                status_code=400,
                detail=f"Strategy model {ask_request.strategy_model} not found",
            )
        if not answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Answer model {ask_request.answer_model} not found",
            )
        if not final_answer_model:
            raise HTTPException(
                status_code=400,
                detail=f"Final answer model {ask_request.final_answer_model} not found",
            )

        # Check if embedding model is available
        if not await model_manager.get_embedding_model():
            raise HTTPException(
                status_code=400,
                detail="Ask feature requires an embedding model. Please configure one in the Models section.",
            )

        # Run the ask graph and get final result
        final_answer = None
        async for chunk in ask_graph.astream(
            input=dict(question=ask_request.question),  # type: ignore[arg-type]
            config=dict(
                configurable=dict(
                    strategy_model=strategy_model.id,
                    answer_model=answer_model.id,
                    final_answer_model=final_answer_model.id,
                )
            ),
            stream_mode="updates",
        ):
            if "write_final_answer" in chunk:
                final_answer = chunk["write_final_answer"]["final_answer"]

        if not final_answer:
            raise HTTPException(status_code=500, detail="No answer generated")

        return AskResponse(answer=final_answer, question=ask_request.question)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ask simple endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ask operation failed: {str(e)}")


# ---------------------------------------------------------------------------
# Notebook-scoped Ask endpoint
# ---------------------------------------------------------------------------

async def _stream_notebook_ask_response(
    question: str,
    strategy_model: Model,
    answer_model: Model,
    final_answer_model: Model,
    resolved_notebooks,        # ResolvedNotebooks from notebook_ask()
    owner_id: str,
    language: str,
    context_key: str,
    cached_answer: Optional[str] = None,
    question_embedding: Optional[List[float]] = None,
    cache_match: Optional[Dict[str, Any]] = None,
    start_time: Optional[float] = None,
) -> AsyncGenerator[str, None]:
    """
    Stream the notebook-scoped Ask response as SSE.

    Emits the same event types as the global ``stream_ask_response`` but adds:
    - ``resolved_notebooks`` (once, first event) – UI chips for which notebooks were used
    - ``out_of_rag`` (once) – when no RAG was found, the UI shows a disclaimer chip
    - ``cache_match`` (once) – Phase 1: tells the client whether the answer was served
      from cache (exact/semantic/miss), and how many tokens we estimate we saved.
    - ``cache_stats`` (in the final ``complete`` event) – same metrics plus the
      total elapsed time so the dashboard can display per-request latency.
    """
    if start_time is None:
        start_time = time.time()
    try:
        # Always emit resolved notebook metadata first so the UI can show chips
        resolved_payload = NotebookAskResolvedResponse(
            resolved=[
                NotebookContextBlockPayload(
                    notebook_id=b.notebook_id,
                    notebook_name=b.notebook_name,
                    chunk_count=len(b.chunks),
                    total_chars=b.total_chars,
                )
                for b in resolved_notebooks.resolved
            ],
            failed_refs=resolved_notebooks.failed_refs,
            global_fallback_used=resolved_notebooks.global_fallback_used,
            out_of_rag=resolved_notebooks.out_of_rag,
        )
        yield f"data: {json.dumps({'type': 'resolved_notebooks', **resolved_payload.model_dump()})}\n\n"

        # Phase 1: announce whether the answer will come from cache
        if cache_match is not None:
            yield f"data: {json.dumps({'type': 'cache_match', **cache_match})}\n\n"

        if cached_answer is not None:
            yield f"data: {json.dumps({'type': 'final_answer', 'content': cached_answer, 'cached': True})}\n\n"
            elapsed = int((time.time() - start_time) * 1000)
            cache_metrics.record_answer_similarity(
                float(cache_match.get("similarity", 0.0)) if cache_match else 0.0
            )
            yield f"data: {json.dumps({'type': 'complete', 'final_answer': cached_answer, 'cached': True, 'elapsed_ms': elapsed, 'cache_match': cache_match})}\n\n"
            return

        if resolved_notebooks.out_of_rag:
            # No RAG at all – call the final-answer model directly with a
            # "(out of RAG source)" label appended to the prompt.
            try:
                direct_answer = await _invoke_direct_answer(
                    question=question,
                    language=language,
                    owner_id=owner_id,
                    model_id=final_answer_model.id,
                )
            except Exception:
                # Surface the error gracefully as an SSE frame
                yield f"data: {json.dumps({'type': 'error', 'message': 'Failed to generate answer'})}\n\n"
                return

            yield f"data: {json.dumps({'type': 'final_answer', 'content': direct_answer, 'out_of_rag': True})}\n\n"
            await set_cached_answer(
                question,
                direct_answer,
                context_key,
                language,
                question_embedding,
                scope_metadata={
                    "tenant_id": owner_id,
                    "out_of_rag": True,
                    "final_model_id": str(final_answer_model.id),
                },
            )
            elapsed = int((time.time() - start_time) * 1000)
            yield f"data: {json.dumps({'type': 'complete', 'final_answer': direct_answer, 'elapsed_ms': elapsed})}\n\n"
            return

        # Build the weighted-per-notebook prompt
        prompt = _build_notebook_ask_prompt(
            question=question,
            resolved_notebooks=resolved_notebooks.resolved,
            global_chunks=resolved_notebooks.global_fallback_chunks,
            language=language,
            include_original=False,
        )

        # Run the ask graph on the built prompt
        async for chunk in ask_graph.astream(
            input=dict(question=prompt),
            config=dict(
                configurable=dict(
                    strategy_model=strategy_model.id,
                    answer_model=answer_model.id,
                    final_answer_model=final_answer_model.id,
                )
            ),
            stream_mode="updates",
        ):
            if "agent" in chunk:
                strategy_data = {
                    "type": "strategy",
                    "reasoning": chunk["agent"]["strategy"].reasoning,
                    "searches": [
                        {"term": s.term, "instructions": s.instructions}
                        for s in chunk["agent"]["strategy"].searches
                    ],
                }
                yield f"data: {json.dumps(strategy_data)}\n\n"

            elif "provide_answer" in chunk:
                for answer in chunk["provide_answer"]["answers"]:
                    answer_data = {"type": "answer", "content": answer}
                    yield f"data: {json.dumps(answer_data)}\n\n"

            elif "write_final_answer" in chunk:
                final_answer = chunk["write_final_answer"]["final_answer"]
                final_data = {"type": "final_answer", "content": final_answer}
                yield f"data: {json.dumps(final_data)}\n\n"

        completion_data = {"type": "complete", "final_answer": final_answer}
        if final_answer:
            await set_cached_answer(
                question,
                final_answer,
                context_key,
                language,
                question_embedding,
                scope_metadata={
                    "tenant_id": owner_id,
                    "out_of_rag": bool(resolved_notebooks.out_of_rag),
                    "final_model_id": str(final_answer_model.id),
                },
            )
            completion_data["elapsed_ms"] = int((time.time() - start_time) * 1000)
        yield f"data: {json.dumps(completion_data)}\n\n"

    except Exception as e:
        from open_notebook.utils.error_classifier import classify_error

        _, user_message = classify_error(e)
        logger.error(f"Error in notebook-ask streaming: {str(e)}")
        error_data = {"type": "error", "message": user_message}
        yield f"data: {json.dumps(error_data)}\n\n"


async def _invoke_direct_answer(
    question: str,
    language: str,
    owner_id: str,
    model_id: Optional[str] = None,
) -> str:
    """Call the final-answer model directly with no RAG context."""
    from open_notebook.ai.models import model_manager as _mm

    try:
        if model_id:
            model = await _mm.get_model(model_id)
        else:
            model = await _mm.get_default_model("chat")
    except Exception:
        from open_notebook.exceptions import ConfigurationError
        raise ConfigurationError(
            "No language model is configured. "
            "Go to Settings → Models and pick a default chat model."
        )
    if model is None:
        from open_notebook.exceptions import ConfigurationError
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
        ai_message = await model.ainvoke(f"{system_prompt}\n\n{user_prompt}")
        return extract_text_content(ai_message.content)
    except Exception as exc:
        logger.exception(f"Direct LLM call failed for owner {owner_id}: {exc}")
        from open_notebook.exceptions import ExternalServiceError
        raise ExternalServiceError(f"LLM call failed: {exc}")


@router.post("/search/ask/notebooks")
async def ask_with_notebooks(
    request: Request,
    owner_id: str = Depends(_resolve_owner_id),
):
    """
    Answer a question scoped to specific notebooks.

    Each notebook is searched independently and gets its own labelled section
    in the prompt so the model can compare and attribute across sources.
    If no RAG chunks are found anywhere, the LLM answers directly and the
    response carries an ``out_of_rag: true`` marker.
    """
    try:
        # Parse body manually; avoids FastAPI body-parameter conflict that can
        # cause RequestValidationError on some deployments.
        raw_body = await request.json()
        payload = NotebookAskRequest.model_validate(raw_body)
    except Exception as exc:
        from fastapi.exceptions import RequestValidationError
        raise RequestValidationError(errors=[{
            "type": "body",
            "loc": ("body",),
            "msg": f"Invalid request body: {exc}",
            "input": None,
        }])

    try:
        # ── Early validation ─────────────────────────────────────────────────────
        # Enforce max 3 notebooks immediately (before any async model lookups)
        if len(payload.notebook_refs) > 3:
            raise HTTPException(
                status_code=422,
                detail="Maximum 3 notebooks allowed per request.",
            )

        # ── Owner resolution ──────────────────────────────────────────────────
        effective_owner = owner_id

        # ── Notebook context (resolution + search) ───────────────────────────────
        # notebook_ask() validates the question and returns context metadata.
        # It may short-circuit to out-of-RAG mode without needing any model.
        resolved = await notebook_ask(
            owner_id=effective_owner,
            question=payload.question,
            notebook_refs=payload.notebook_refs,
            language=payload.language,
            strategy_model_id=payload.strategy_model,
            answer_model_id=payload.answer_model,
            final_model_id=payload.final_answer_model,
        )

        # Shared across users only when the selected notebook content is the
        # same. Exact repeats use no AI call; similar questions use one cheap
        # embedding comparison and skip the language-model graph on a hit.
        # Phase 1: pass tenant_id (owner_id) and prompt_version into the
        # fingerprint so Phase 2/4 invalidations will be a no-op upgrade.
        context_key = context_fingerprint(
            resolved,
            language=payload.language,
            knowledge_version=None,  # wired in by Phase 2
            tenant_id=effective_owner,
            prompt_version="v1",
        )
        cached_answer, question_embedding, cache_match = await get_cached_answer(
            payload.question, context_key, payload.language
        )

        # ── Model resolution ──────────────────────────────────────────────────
        # At this point we know we need a model (not out_of_rag → direct answer).
        # Resolve explicit overrides first, then fall back to defaults.
        resolved_models = {}
        for model_type, model_id in [
            ("strategy", payload.strategy_model),
            ("answer", payload.answer_model),
            ("final", payload.final_answer_model),
        ]:
            if model_id:
                model = await Model.get(model_id)
                if not model:
                    raise HTTPException(
                        status_code=400,
                        detail=f"{model_type.title()} model '{model_id}' not found",
                    )
                resolved_models[model_type] = model

        # Fetch defaults for any missing models
        if "strategy" not in resolved_models:
            model = await model_manager.get_default_model("chat")
            if not model:
                raise HTTPException(
                    status_code=400,
                    detail="No default chat model configured. Go to Settings → Models.",
                )
            resolved_models["strategy"] = model
        if "answer" not in resolved_models:
            resolved_models["answer"] = resolved_models["strategy"]
        if "final" not in resolved_models:
            resolved_models["final"] = resolved_models["strategy"]

        # ── Stream response ─────────────────────────────────────────────────────
        return StreamingResponse(
            _stream_notebook_ask_response(
                question=payload.question,
                strategy_model=resolved_models["strategy"],
                answer_model=resolved_models["answer"],
                final_answer_model=resolved_models["final"],
                resolved_notebooks=resolved,
                owner_id=effective_owner,
                language=payload.language,
                context_key=context_key,
                cached_answer=cached_answer,
                question_embedding=question_embedding,
                cache_match=cache_match,
                start_time=time.time(),
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in notebook-ask endpoint: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Ask operation failed: {str(e)}")

