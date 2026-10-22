"""
Global chat: the persistent chat on the Ask tab of /search, across notebooks
instead of inside one, plus generated titles for chat sessions (global and
notebook).
"""

import asyncio
import json
import traceback
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field

from api.dependencies import _resolve_owner_id, owner_can_access
from api.routers.chat import ChatMessage, SuccessResponse, UpdateSessionRequest
from kmitl_rag.chat_filters import (
    _filter_url_citations,
    _pin_relevant_excerpts,
    _verify_course_codes,
)
from kmitl_rag.domain import GlobalChatSession
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.notebook import ChatSession, Note, Notebook, Source
from open_notebook.exceptions import NotFoundError
from open_notebook.graphs.chat import graph as chat_graph
from open_notebook.utils.graph_utils import get_session_message_count

router = APIRouter()


# =============================================================================
# Global Chat models (Ask tab — not scoped to a notebook)
# =============================================================================

class CreateGlobalSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="Optional session title")
    model_override: Optional[str] = Field(
        None, description="Optional model override for this session"
    )


class GlobalChatSessionResponse(BaseModel):
    id: str = Field(..., description="Session ID")
    title: str = Field(..., description="Session title")
    created: str = Field(..., description="Creation timestamp")
    updated: str = Field(..., description="Last update timestamp")
    message_count: Optional[int] = Field(
        None, description="Number of messages in session"
    )
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )


class GlobalChatSessionWithMessagesResponse(GlobalChatSessionResponse):
    messages: List[ChatMessage] = Field(
        default_factory=list, description="Session messages"
    )


class ExecuteGlobalChatRequest(BaseModel):
    session_id: Optional[str] = Field(
        None,
        description="Session ID. If not provided, a new session is created.",
    )
    message: str = Field(..., description="User message content")
    context: Dict[str, Any] = Field(
        default_factory=dict,
        description="Chat context (sources, notes). Empty dict means global/no scope.",
    )
    model_override: Optional[str] = Field(
        None, description="Optional model override for this message"
    )
    title: Optional[str] = Field(
        None,
        description="Session title. Only used when creating a new session.",
    )
    notebook_id: Optional[str] = Field(
        None,
        description=(
            "Notebook the chat is scoped to. When set, the server pins the top-k "
            "semantic-search matches for the user's message to the top of the "
            "context so the model focuses on the most relevant chunks."
        ),
    )


class ExecuteGlobalChatResponse(BaseModel):
    session_id: str = Field(..., description="Session ID")
    messages: List[ChatMessage] = Field(..., description="Updated message list")


# =============================================================================
# Global Chat endpoints (Ask tab)
# =============================================================================

@router.get("/chat/global/sessions", response_model=List[GlobalChatSessionResponse])
async def get_global_sessions(
    owner_id: str = Depends(_resolve_owner_id),
):
    """Get all global chat sessions for the authenticated user."""
    try:
        sessions = await GlobalChatSession.get_global_sessions(owner_id)

        results = []
        for session in sessions:
            # Filter by owner_id (backward compat: sessions with no owner_id are visible)
            session_owner = getattr(session, "owner_id", None)
            if session_owner is not None and session_owner != owner_id:
                continue

            session_id = str(session.id)

            # Get message count from LangGraph state
            msg_count = await get_session_message_count(chat_graph, session_id)

            results.append(
                GlobalChatSessionResponse(
                    id=session.id or "",
                    title=session.title or "Untitled Session",
                    created=str(session.created) if session.created else "",
                    updated=str(session.updated) if session.updated else "",
                    message_count=msg_count,
                    model_override=getattr(session, "model_override", None),
                )
            )

        return results
    except Exception as e:
        logger.error(f"Error fetching global chat sessions: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching global chat sessions: {str(e)}"
        )


@router.post("/chat/global/sessions", response_model=GlobalChatSessionResponse)
async def create_global_session(
    request: CreateGlobalSessionRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Create a new global chat session for the authenticated user."""
    try:
        session = GlobalChatSession(
            title=request.title
            or f"Chat {asyncio.get_event_loop().time():.0f}",
            model_override=request.model_override,
            owner_id=owner_id,
        )
        await session.save()

        return GlobalChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            created=str(session.created) if session.created else "",
            updated=str(session.updated) if session.updated else "",
            message_count=0,
            model_override=session.model_override,
        )
    except Exception as e:
        logger.error(f"Error creating global chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating global chat session: {str(e)}"
        )


@router.get(
    "/chat/global/sessions/{session_id}",
    response_model=GlobalChatSessionWithMessagesResponse,
)
async def get_global_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Get a global chat session with its messages."""
    try:
        full_session_id = (
            session_id
            if session_id.startswith("global_chat_session:")
            else f"global_chat_session:{session_id}"
        )
        session = await GlobalChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify ownership
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get message count
        msg_count = await get_session_message_count(chat_graph, full_session_id)

        # Retrieve messages from LangGraph state
        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        state_values = current_state.values if current_state else {}
        raw_messages: list = state_values.get("messages", [])
        # The context stored alongside the messages is the one that was fed
        # to the model, so URL allowlist / verbatim-context checks stay
        # consistent whether the message is streamed live or replayed later.
        stored_context = state_values.get("context") or {}

        messages: List[ChatMessage] = []
        for msg in raw_messages:
            content = msg.content if hasattr(msg, "content") else str(msg)
            msg_type = msg.type if hasattr(msg, "type") else "unknown"
            if msg_type == "ai" and isinstance(content, str):
                content = _filter_url_citations(content, stored_context)
                content = await _verify_course_codes(content, stored_context)
            messages.append(
                ChatMessage(
                    id=getattr(msg, "id", f"msg_{len(messages)}"),
                    type=msg_type,
                    content=content,
                    timestamp=None,
                )
            )

        return GlobalChatSessionWithMessagesResponse(
            id=session.id or "",
            title=session.title or "Untitled Session",
            created=str(session.created) if session.created else "",
            updated=str(session.updated) if session.updated else "",
            message_count=msg_count,
            model_override=getattr(session, "model_override", None),
            messages=messages,
        )
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error fetching global chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching global chat session: {str(e)}"
        )


@router.put(
    "/chat/global/sessions/{session_id}",
    response_model=GlobalChatSessionResponse,
)
async def update_global_session(
    session_id: str,
    request: UpdateSessionRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Update a global chat session (title or model_override)."""
    try:
        full_session_id = (
            session_id
            if session_id.startswith("global_chat_session:")
            else f"global_chat_session:{session_id}"
        )
        session = await GlobalChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        if request.title is not None:
            session.title = request.title
        if request.model_override is not None:
            session.model_override = request.model_override

        session.updated = None  # SurrealDB will set to now() via DEFAULT
        await session.save()

        msg_count = await get_session_message_count(chat_graph, full_session_id)

        return GlobalChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            created=str(session.created) if session.created else "",
            updated=str(session.updated) if session.updated else "",
            message_count=msg_count,
            model_override=session.model_override,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating global chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error updating global chat session: {str(e)}"
        )


async def _generate_chat_title(seed_text: str) -> str:
    """
    Ask the default chat model to produce a concise chat title from the
    user's opening message. Falls back to a 40-char truncation of the seed
    when the LLM call fails so title generation never blocks the reply.
    """
    seed_text = (seed_text or "").strip()
    if not seed_text:
        return "New Chat"
    fallback = seed_text[:40] + ("…" if len(seed_text) > 40 else "")
    try:
        from open_notebook.graphs.prompt import graph as prompt_graph

        prompt = (
            "Summarise the user's chat question into a short, descriptive Thai/English "
            "title for the conversation. Rules: 3–8 words, no quotes, no trailing "
            "punctuation, no emoji, keep language of the source, do not answer the "
            "question — just title it."
        )
        result = await prompt_graph.ainvoke(
            {  # type: ignore[arg-type]
                "input_text": seed_text[:800],
                "prompt": prompt,
            }
        )
        title = str(result.get("output") or "").strip()
        # Strip surrounding quotes / trailing punctuation the model sometimes adds.
        title = title.strip('\"\'“”‘’ .,:;-—')
        if not title:
            return fallback
        return title[:80]
    except Exception as exc:
        logger.warning(f"auto-title: LLM call failed, using fallback: {exc}")
        return fallback


class AutoTitleResponse(BaseModel):
    title: str = Field(..., description="AI-generated chat title")


@router.post(
    "/chat/global/sessions/{session_id}/auto-title",
    response_model=AutoTitleResponse,
)
async def auto_title_global_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Regenerate the session title from the first user message via LLM."""
    try:
        full_session_id = (
            session_id
            if session_id.startswith("global_chat_session:")
            else f"global_chat_session:{session_id}"
        )
        session = await GlobalChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        first_user = ""
        for msg in (current_state.values.get("messages") if current_state else []) or []:
            if getattr(msg, "type", None) in {"human", "user"}:
                first_user = str(getattr(msg, "content", "") or "")
                break
        if not first_user:
            raise HTTPException(status_code=400, detail="Session has no user message yet")

        title = await _generate_chat_title(first_user)
        session.title = title
        session.updated = None
        await session.save()
        return AutoTitleResponse(title=title)
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error auto-titling global session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/chat/global/sessions/{session_id}", response_model=SuccessResponse)
async def delete_global_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Delete a global chat session."""
    try:
        full_session_id = (
            session_id
            if session_id.startswith("global_chat_session:")
            else f"global_chat_session:{session_id}"
        )
        session = await GlobalChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        await session.delete()

        return SuccessResponse(success=True, message="Session deleted")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting global chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error deleting global chat session: {str(e)}"
        )


@router.post("/chat/global/execute", response_model=ExecuteGlobalChatResponse)
async def execute_global_chat(
    request: ExecuteGlobalChatRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """
    Send a message in a global chat session (not scoped to a notebook).
    If session_id is not provided, creates a new session first.
    Uses the same chat_graph as notebook-scoped chat so LangGraph checkpoints
    persist correctly per session.
    """
    try:
        session_id = request.session_id
        title = request.title

        if session_id:
            # Verify existing session
            full_session_id = (
                session_id
                if session_id.startswith("global_chat_session:")
                else f"global_chat_session:{session_id}"
            )
            session = await GlobalChatSession.get(full_session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            session_owner = getattr(session, "owner_id", None)
            if session_owner is not None and session_owner != owner_id:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            # Create new session
            session = GlobalChatSession(
                title=title or f"Chat {asyncio.get_event_loop().time():.0f}",
                model_override=request.model_override,
                owner_id=owner_id,
            )
            await session.save()
            full_session_id = session.id or ""

        # Determine model override
        model_override = (
            request.model_override
            if request.model_override is not None
            else getattr(session, "model_override", None)
        )

        # Get current LangGraph state — pin semantic-search excerpts when a
        # notebook_id is supplied (mirrors the streaming variant).
        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        pinned_context = await _pin_relevant_excerpts(
            request.context or {}, request.notebook_id, request.message
        )
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        state_values["context"] = pinned_context
        state_values["notebook"] = None  # No notebook scope for global chat
        state_values["model_override"] = model_override

        # Add user message
        from langchain_core.messages import HumanMessage

        user_message = HumanMessage(content=request.message)
        state_values["messages"].append(user_message)

        # Execute chat graph
        result = await asyncio.to_thread(
            chat_graph.invoke,
            input=state_values,  # type: ignore[arg-type]
            config=RunnableConfig(
                configurable={
                    "thread_id": full_session_id,
                    "model_id": model_override,
                }
            ),
        )

        # Update session timestamp
        await session.save()

        # Convert messages (URL + course-code filtering)
        messages: List[ChatMessage] = []
        for msg in result.get("messages", []):
            content = msg.content if hasattr(msg, "content") else str(msg)
            msg_type = msg.type if hasattr(msg, "type") else "unknown"
            if msg_type == "ai" and isinstance(content, str):
                content = _filter_url_citations(content, pinned_context)
                content = await _verify_course_codes(content, pinned_context)
            messages.append(
                ChatMessage(
                    id=getattr(msg, "id", f"msg_{len(messages)}"),
                    type=msg_type,
                    content=content,
                    timestamp=None,
                )
            )

        return ExecuteGlobalChatResponse(
            session_id=request.session_id if request.session_id else full_session_id,
            messages=messages,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(
            f"Error executing global chat: {str(e)}\n"
            f"  Session ID: {request.session_id}\n"
            f"  Traceback:\n{traceback.format_exc()}"
        )
        raise HTTPException(
            status_code=500, detail=f"Error executing global chat: {str(e)}"
        )


@router.post(
    "/chat/sessions/{session_id}/auto-title",
    response_model=AutoTitleResponse,
)
async def auto_title_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Regenerate a notebook chat session title from the first user message."""
    try:
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        first_user = ""
        for msg in (current_state.values.get("messages") if current_state else []) or []:
            if getattr(msg, "type", None) in {"human", "user"}:
                first_user = str(getattr(msg, "content", "") or "")
                break
        if not first_user:
            raise HTTPException(status_code=400, detail="Session has no user message yet")

        title = await _generate_chat_title(first_user)
        session.title = title
        session.updated = None
        await session.save()
        return AutoTitleResponse(title=title)
    except HTTPException:
        raise
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error auto-titling notebook chat session: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


async def _stream_global_chat_response(
    session_id: str,
    message: str,
    context: Dict[str, Any],
    model_override: Optional[str] = None,
    notebook_id: Optional[str] = None,
) -> Any:
    """
    Async generator that yields SSE frames for the global chat response.
    Mirrors the pattern used in `source_chat.py:stream_source_chat_response`.
    """
    try:
        full_session_id = (
            session_id
            if session_id.startswith("global_chat_session:")
            else f"global_chat_session:{session_id}"
        )

        # Get current LangGraph state
        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        # Pin the top semantic-search excerpts for the user's query so the model
        # sees the most relevant chunks first (approach 4). Stored in the same
        # `context` dict, keyed as `relevant_excerpts`, and persisted alongside
        # the messages so later replay through the URL/code filters can still
        # check tokens against the same context.
        context = await _pin_relevant_excerpts(context, notebook_id, message)
        state_values["context"] = context
        state_values["notebook"] = None
        state_values["model_override"] = model_override

        # Add user message
        user_message = HumanMessage(content=message)
        state_values["messages"].append(user_message)

        # Emit user message event
        yield f"data: {json.dumps({'type': 'user_message', 'content': message})}\n\n"

        # Run chat graph in thread (SqliteSaver is sync)
        result = await asyncio.to_thread(
            chat_graph.invoke,
            input=state_values,  # type: ignore[arg-type]
            config=RunnableConfig(
                configurable={"thread_id": full_session_id, "model_id": model_override}
            ),
        )

        # Emit AI messages (URL + course-code hallucination filtering)
        for msg in result.get("messages", []):
            if hasattr(msg, "type") and msg.type == "ai":
                filtered = _filter_url_citations(msg.content, context)
                filtered = await _verify_course_codes(filtered, context)
                yield f"data: {json.dumps({'type': 'ai_message', 'content': filtered})}\n\n"

        # Emit completion
        yield f"data: {json.dumps({'type': 'complete'})}\n\n"

    except Exception as e:
        from open_notebook.utils.error_classifier import classify_error

        _, user_message = classify_error(e)
        logger.error(f"Error in global chat streaming: {str(e)}")
        yield f"data: {json.dumps({'type': 'error', 'message': user_message})}\n\n"


@router.post("/chat/global/execute/stream")
async def execute_global_chat_stream(
    request: ExecuteGlobalChatRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """
    Send a message in a global chat session with SSE streaming response.
    If session_id is not provided, creates a new session first.
    """
    try:
        session_id = request.session_id
        title = request.title

        if session_id:
            # Verify existing session
            full_session_id = (
                session_id
                if session_id.startswith("global_chat_session:")
                else f"global_chat_session:{session_id}"
            )
            session = await GlobalChatSession.get(full_session_id)
            if not session:
                raise HTTPException(status_code=404, detail="Session not found")

            session_owner = getattr(session, "owner_id", None)
            if session_owner is not None and session_owner != owner_id:
                raise HTTPException(status_code=404, detail="Session not found")
        else:
            # Create new session
            session = GlobalChatSession(
                title=title or f"Chat {asyncio.get_event_loop().time():.0f}",
                model_override=request.model_override,
                owner_id=owner_id,
            )
            await session.save()
            full_session_id = session.id or ""

        # Determine model override
        model_override = (
            request.model_override
            if request.model_override is not None
            else getattr(session, "model_override", None)
        )

        # Update session timestamp
        await session.save()

        return StreamingResponse(
            _stream_global_chat_response(
                session_id=full_session_id,
                message=request.message,
                context=request.context or {},
                model_override=model_override,
                notebook_id=request.notebook_id,
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
        logger.error(f"Error in global chat stream: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(
            status_code=500, detail=f"Error in global chat stream: {str(e)}"
        )
