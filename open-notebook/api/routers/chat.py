import asyncio
import json
import re
import traceback
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from loguru import logger
from pydantic import BaseModel, Field

from api.dependencies import _resolve_owner_id, owner_can_access
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.notebook import ChatSession, GlobalChatSession, Note, Notebook, Source
from open_notebook.exceptions import (
    NotFoundError,
)
from open_notebook.graphs.chat import graph as chat_graph
from open_notebook.utils.graph_utils import get_session_message_count

router = APIRouter()


# Request/Response models
class CreateSessionRequest(BaseModel):
    notebook_id: str = Field(..., description="Notebook ID to create session for")
    title: Optional[str] = Field(None, description="Optional session title")
    model_override: Optional[str] = Field(
        None, description="Optional model override for this session"
    )


class UpdateSessionRequest(BaseModel):
    title: Optional[str] = Field(None, description="New session title")
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )


class ChatMessage(BaseModel):
    id: str = Field(..., description="Message ID")
    type: str = Field(..., description="Message type (human|ai)")
    content: str = Field(..., description="Message content")
    timestamp: Optional[str] = Field(None, description="Message timestamp")


class ChatSessionResponse(BaseModel):
    id: str = Field(..., description="Session ID")
    title: str = Field(..., description="Session title")
    notebook_id: Optional[str] = Field(None, description="Notebook ID")
    created: str = Field(..., description="Creation timestamp")
    updated: str = Field(..., description="Last update timestamp")
    message_count: Optional[int] = Field(
        None, description="Number of messages in session"
    )
    model_override: Optional[str] = Field(
        None, description="Model override for this session"
    )


class ChatSessionWithMessagesResponse(ChatSessionResponse):
    messages: List[ChatMessage] = Field(
        default_factory=list, description="Session messages"
    )


class ExecuteChatRequest(BaseModel):
    session_id: str = Field(..., description="Chat session ID")
    message: str = Field(..., description="User message content")
    context: Dict[str, Any] = Field(
        ..., description="Chat context with sources and notes"
    )
    model_override: Optional[str] = Field(
        None, description="Optional model override for this message"
    )


class ExecuteChatResponse(BaseModel):
    session_id: str = Field(..., description="Session ID")
    messages: List[ChatMessage] = Field(..., description="Updated message list")


class BuildContextRequest(BaseModel):
    notebook_id: str = Field(..., description="Notebook ID")
    context_config: Dict[str, Any] = Field(..., description="Context configuration")


class BuildContextResponse(BaseModel):
    context: Dict[str, Any] = Field(..., description="Built context data")
    token_count: int = Field(..., description="Estimated token count")
    char_count: int = Field(..., description="Character count")


class SuccessResponse(BaseModel):
    success: bool = Field(True, description="Operation success status")
    message: str = Field(..., description="Success message")


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


@router.get("/chat/sessions", response_model=List[ChatSessionResponse])
async def get_sessions(
    notebook_id: str = Query(..., description="Notebook ID"),
    owner_id: str = Depends(_resolve_owner_id),
):
    """Get all chat sessions for a notebook (scoped to the authenticated user)."""
    try:
        # Verify notebook exists and belongs to the owner
        notebook = await Notebook.get(notebook_id)
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Verify notebook belongs to this owner
        if not owner_can_access(notebook, owner_id):
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Get sessions for this notebook
        sessions_list = await notebook.get_chat_sessions()

        results = []
        for session in sessions_list:
            # Filter sessions by owner_id (backward compat: sessions with no owner_id are visible)
            session_owner = getattr(session, "owner_id", None)
            if session_owner is not None and session_owner != owner_id:
                continue

            session_id = str(session.id)

            # Get message count from LangGraph state
            msg_count = await get_session_message_count(chat_graph, session_id)

            results.append(
                ChatSessionResponse(
                    id=session.id or "",
                    title=session.title or "Untitled Session",
                    notebook_id=notebook_id,
                    created=str(session.created),
                    updated=str(session.updated),
                    message_count=msg_count,
                    model_override=getattr(session, "model_override", None),
                )
            )

        return results
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Notebook not found")
    except Exception as e:
        logger.error(f"Error fetching chat sessions: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error fetching chat sessions: {str(e)}"
        )


@router.post("/chat/sessions", response_model=ChatSessionResponse)
async def create_session(
    request: CreateSessionRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Create a new chat session (scoped to the authenticated user)."""
    try:
        # Verify notebook exists and belongs to the owner
        notebook = await Notebook.get(request.notebook_id)
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Verify notebook belongs to this owner
        if not owner_can_access(notebook, owner_id):
            raise HTTPException(status_code=404, detail="Notebook not found")

        # Create new session with owner_id
        session = ChatSession(
            title=request.title
            or f"Chat Session {asyncio.get_event_loop().time():.0f}",
            model_override=request.model_override,
            owner_id=owner_id,
        )
        await session.save()

        # Relate session to notebook
        await session.relate_to_notebook(request.notebook_id)

        return ChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            notebook_id=request.notebook_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=0,
            model_override=session.model_override,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Notebook not found")
    except Exception as e:
        logger.error(f"Error creating chat session: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Error creating chat session: {str(e)}"
        )


@router.get(
    "/chat/sessions/{session_id}", response_model=ChatSessionWithMessagesResponse
)
async def get_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Get a specific session with its messages (scoped to the authenticated user)."""
    try:
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify session belongs to this owner (backward compat: no owner_id = visible)
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        # Get session state from LangGraph to retrieve messages
        # Use sync get_state() in a thread since SqliteSaver doesn't support async
        thread_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )

        # Extract messages from state — apply URL/course-code filters on replay
        # so hallucinated URLs from older responses get stripped and fake course
        # codes get flagged with ⚠️ instead of silently misleading the reader.
        messages: list[ChatMessage] = []
        stored_context = (
            thread_state.values.get("context")
            if thread_state and thread_state.values
            else None
        ) or {}
        if thread_state and thread_state.values and "messages" in thread_state.values:
            for msg in thread_state.values["messages"]:
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
                        timestamp=None,  # LangChain messages don't have timestamps by default
                    )
                )

        # Find notebook_id (we need to query the relationship)
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )

        notebook_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )

        notebook_id = notebook_query[0]["out"] if notebook_query else None

        if not notebook_id:
            # This might be an old session created before API migration
            logger.warning(
                f"No notebook relationship found for session {session_id} - may be an orphaned session"
            )

        return ChatSessionWithMessagesResponse(
            id=session.id or "",
            title=session.title or "Untitled Session",
            notebook_id=notebook_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=len(messages),
            messages=messages,
            model_override=getattr(session, "model_override", None),
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error fetching session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error fetching session: {str(e)}")


@router.put("/chat/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_session(
    session_id: str,
    request: UpdateSessionRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Update session title (scoped to the authenticated user)."""
    try:
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify session belongs to this owner
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        update_data = request.model_dump(exclude_unset=True)

        if "title" in update_data:
            session.title = update_data["title"]

        if "model_override" in update_data:
            session.model_override = update_data["model_override"]

        await session.save()

        # Find notebook_id
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        notebook_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )
        notebook_id = notebook_query[0]["out"] if notebook_query else None

        # Get message count from LangGraph state
        msg_count = await get_session_message_count(chat_graph, full_session_id)

        return ChatSessionResponse(
            id=session.id or "",
            title=session.title or "",
            notebook_id=notebook_id,
            created=str(session.created),
            updated=str(session.updated),
            message_count=msg_count,
            model_override=session.model_override,
        )
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error updating session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error updating session: {str(e)}")


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


@router.delete("/chat/sessions/{session_id}", response_model=SuccessResponse)
async def delete_session(
    session_id: str,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Delete a chat session (scoped to the authenticated user)."""
    try:
        # Ensure session_id has proper table prefix
        full_session_id = (
            session_id
            if session_id.startswith("chat_session:")
            else f"chat_session:{session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify session belongs to this owner
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        await session.delete()

        return SuccessResponse(success=True, message="Session deleted successfully")
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        logger.error(f"Error deleting session: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error deleting session: {str(e)}")


@router.post("/chat/execute", response_model=ExecuteChatResponse)
async def execute_chat(
    request: ExecuteChatRequest,
    owner_id: str = Depends(_resolve_owner_id),
):
    """Execute a chat request and get AI response (scoped to the authenticated user)."""
    try:
        # Verify session exists
        # Ensure session_id has proper table prefix
        full_session_id = (
            request.session_id
            if request.session_id.startswith("chat_session:")
            else f"chat_session:{request.session_id}"
        )
        session = await ChatSession.get(full_session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        # Verify session belongs to this owner
        session_owner = getattr(session, "owner_id", None)
        if session_owner is not None and session_owner != owner_id:
            raise HTTPException(status_code=404, detail="Session not found")

        # Fetch notebook linked to this session
        notebook_query = await repo_query(
            "SELECT out FROM refers_to WHERE in = $session_id",
            {"session_id": ensure_record_id(full_session_id)},
        )
        notebook = None
        if notebook_query:
            notebook = await Notebook.get(notebook_query[0]["out"])

        # Determine model override (per-request override takes precedence over session-level)
        model_override = (
            request.model_override
            if request.model_override is not None
            else getattr(session, "model_override", None)
        )

        # Get current state
        # Use sync get_state() in a thread since SqliteSaver doesn't support async
        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )

        # Prepare state for execution — pin semantic-search excerpts from the
        # linked notebook so the model sees the most relevant chunks first
        # (mirrors the streaming global-chat behaviour).
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        notebook_id_for_pin = notebook.id if notebook else None
        pinned_context = await _pin_relevant_excerpts(
            request.context or {}, notebook_id_for_pin, request.message
        )
        state_values["context"] = pinned_context
        state_values["notebook"] = notebook
        state_values["model_override"] = model_override

        # Add user message to state
        from langchain_core.messages import HumanMessage

        user_message = HumanMessage(content=request.message)
        state_values["messages"].append(user_message)

        # Execute chat graph in a thread so the synchronous LangGraph invoke
        # (SqliteSaver checkpoints are sync) doesn't block the event loop and
        # freeze the rest of the API while the LLM responds. Mirrors the
        # get_state() calls above.
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

        # Convert messages to response format (URL + course-code filtering)
        messages: list[ChatMessage] = []
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

        return ExecuteChatResponse(session_id=request.session_id, messages=messages)
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Session not found")
    except Exception as e:
        # Log detailed error with context for debugging
        logger.error(
            f"Error executing chat: {str(e)}\n"
            f"  Session ID: {request.session_id}\n"
            f"  Model override: {request.model_override}\n"
            f"  Traceback:\n{traceback.format_exc()}"
        )
        raise HTTPException(status_code=500, detail=f"Error executing chat: {str(e)}")


@router.post("/chat/context", response_model=BuildContextResponse)
async def build_context(request: BuildContextRequest):
    """Build context for a notebook based on context configuration."""
    try:
        # Verify notebook exists
        notebook = await Notebook.get(request.notebook_id)
        if not notebook:
            raise HTTPException(status_code=404, detail="Notebook not found")

        context_data: dict[str, list[dict[str, str]]] = {"sources": [], "notes": []}
        total_content = ""

        # Process context configuration if provided
        if request.context_config:
            # Process sources
            for source_id, status in request.context_config.get("sources", {}).items():
                if "not in" in status:
                    continue

                try:
                    # Add table prefix if not present
                    full_source_id = (
                        source_id
                        if source_id.startswith("source:")
                        else f"source:{source_id}"
                    )

                    try:
                        source = await Source.get(full_source_id)
                    except Exception:
                        continue

                    if "insights" in status:
                        source_context = await source.get_context(context_size="short")
                        context_data["sources"].append(source_context)
                        total_content += str(source_context)
                    elif "full content" in status:
                        source_context = await source.get_context(context_size="long")
                        context_data["sources"].append(source_context)
                        total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source_id}: {str(e)}")
                    continue

            # Process notes
            for note_id, status in request.context_config.get("notes", {}).items():
                if "not in" in status:
                    continue

                try:
                    # Add table prefix if not present
                    full_note_id = (
                        note_id if note_id.startswith("note:") else f"note:{note_id}"
                    )
                    note = await Note.get(full_note_id)
                    if not note:
                        continue

                    if "full content" in status:
                        note_context = note.get_context(context_size="long")
                        context_data["notes"].append(note_context)
                        total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing note {note_id}: {str(e)}")
                    continue
        else:
            # Default behavior - include all sources and notes with short context
            sources = await notebook.get_sources()
            for source in sources:
                try:
                    source_context = await source.get_context(context_size="short")
                    context_data["sources"].append(source_context)
                    total_content += str(source_context)
                except Exception as e:
                    logger.warning(f"Error processing source {source.id}: {str(e)}")
                    continue

            notes = await notebook.get_notes()
            for note in notes:
                try:
                    note_context = note.get_context(context_size="short")
                    context_data["notes"].append(note_context)
                    total_content += str(note_context)
                except Exception as e:
                    logger.warning(f"Error processing note {note.id}: {str(e)}")
                    continue

        # Calculate character and token counts
        char_count = len(total_content)
        # Use token count utility if available
        try:
            from open_notebook.utils import token_count

            estimated_tokens = token_count(total_content) if total_content else 0
        except ImportError:
            # Fallback to simple estimation
            estimated_tokens = char_count // 4

        return BuildContextResponse(
            context=context_data, token_count=estimated_tokens, char_count=char_count
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building context: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error building context: {str(e)}")


# =============================================================================
# URL hallucination filter — prevents the LLM from citing invented URLs
# =============================================================================

# A URL is allowed only when it appears verbatim in the CONTEXT that was fed
# to the model, OR when it matches one of the hard-verified KMITL hostnames
# below. Reason: LLMs like to invent plausible "kmitl-looking" URLs (e.g.
# fiet.kmitl.ac.th) that don't actually exist, or swap kmutt.ac.th →
# kmitl.ac.th. Even subdomains under kmitl.ac.th can be fabricated. So the
# allowlist is intentionally conservative — the model can always link to the
# root kmitl.ac.th and describe which faculty in prose.
_ALLOWED_URL_HOSTS = {
    "kmitl.ac.th",
    "www.kmitl.ac.th",
    # Verified faculty / department / service subdomains. Add more here after
    # a human has visited the URL and confirmed it resolves. Do NOT add
    # speculative "kmitl-looking" hosts — they defeat the filter's purpose.
    "siet.kmitl.ac.th",           # ครุศาสตร์อุตสาหกรรมและเทคโนโลยี — Industrial Education & Technology
    "eng.kmitl.ac.th",            # คณะวิศวกรรมศาสตร์ — Engineering
    "it.kmitl.ac.th",             # คณะเทคโนโลยีสารสนเทศ — Information Technology
    "reg.kmitl.ac.th",            # สำนักทะเบียนและประมวลผล — Registrar
    "www.reg.kmitl.ac.th",
    "science.kmitl.ac.th",        # คณะวิทยาศาสตร์ — Faculty of Science
    "www.science.kmitl.ac.th",
    "osda.kmitl.ac.th",           # สำนักกิจการนักศึกษา — Office of Student Development Affairs
    "gened.kmitl.ac.th",          # สำนักวิชาศึกษาทั่วไป — General Education
    "www.gened.kmitl.ac.th",
    "kbs.kmitl.ac.th",            # KMITL Business School — คณะบริหารธุรกิจ
    "www.kbs.kmitl.ac.th",
    "curriculum.kmitl.ac.th",     # ระบบข้อมูลหลักสูตร — canonical source of truth for curriculum details
                                  # (department/24 = ครุศาสตร์อุตสาหกรรมและเทคโนโลยี)
}
_URL_HOST_PATTERN = re.compile(
    r"^https?://([^/:?#]+)", re.IGNORECASE
)
# Match markdown link: [label](url) — handled before plain URL stripping so we
# can also strip the surrounding [] and () when the URL fails the filter (leaving
# just the label). Otherwise plain-URL stripping would leave broken `[label]()`.
_MARKDOWN_LINK = re.compile(
    r"\[([^\]]*)\]\((https?://[^)\s]+)\)", re.IGNORECASE
)
# Match ANY http(s) URL in prose (not just [url:...]) so plain-text hallucinated
# URLs like "see https://fiet.kmitl.ac.th" also get stripped by the same
# allowlist/context check.
_PLAIN_URL = re.compile(
    r"https?://[^\s\]\"'<>()]+", re.IGNORECASE
)
_URL_CITATION = re.compile(r"\[url:([^\]]+)\]")


def _unwrap_context(context: Dict[str, Any]) -> Dict[str, Any]:
    """
    The /chat/context endpoint returns `{context: {sources, notes}, token_count, ...}`.
    Older frontend builds forwarded that whole envelope to the streaming
    endpoint as `context`, which made every downstream check (URL allowlist,
    course-code verify, RELEVANT_EXCERPTS pin) silently no-op. Accept both
    shapes here so historic sessions still filter correctly on replay.
    """
    if not isinstance(context, dict):
        return {}
    if "sources" in context or "notes" in context or "relevant_excerpts" in context:
        return context
    inner = context.get("context")
    if isinstance(inner, dict):
        return inner
    return context


def _collect_context_texts(context: Dict[str, Any]) -> List[str]:
    """Flatten every text field the model was shown, for verbatim URL matching."""
    context = _unwrap_context(context)
    texts: List[str] = []
    for ex in (context.get("relevant_excerpts") or []):
        if isinstance(ex, dict) and ex.get("text"):
            texts.append(str(ex["text"]))
    for src in (context.get("sources") or []):
        if isinstance(src, dict):
            if src.get("full_text"):
                texts.append(str(src["full_text"]))
            for ins in (src.get("insights") or []):
                if isinstance(ins, dict) and ins.get("content"):
                    texts.append(str(ins["content"]))
    for note in (context.get("notes") or []):
        if isinstance(note, dict) and note.get("content"):
            texts.append(str(note["content"]))
    return texts


# Course-code-like tokens. Two patterns commonly hallucinated by the model:
#   - KMITL faculty codes: 8 digits, often starting with 03 (e.g. 03206107).
#   - General studies codes: 8 digits often starting with 90.
# The AI sometimes writes them with dashes/spaces (03-406-101 / 03 406 101).
# We normalise by stripping whitespace/dashes before the verbatim CONTEXT check.
_COURSE_CODE = re.compile(
    r"(?<![\d.])\d{2}[-\s]?\d{3}[-\s]?\d{3}(?![\d.])"
)


def _normalise_code(token: str) -> str:
    return re.sub(r"[\s\-]", "", token)


async def _fetch_source_full_texts(source_ids: List[str]) -> str:
    """
    Pull the raw full_text of every source referenced in the context so that
    course-code verification can trust the source of truth (the actual PDF /
    extracted document) instead of the maybe-truncated blob that was fed to
    the LLM. Fixes the false-positive where the user picks "insights only"
    mode — full_text is omitted from context, so verify would otherwise flag
    every real course code as fabricated.
    """
    if not source_ids:
        return ""
    try:
        from open_notebook.database.repository import ensure_record_id, repo_query

        rows = await repo_query(
            "SELECT full_text FROM source WHERE id IN $ids",
            {"ids": [ensure_record_id(sid) for sid in source_ids]},
        )
    except Exception as exc:
        logger.warning(f"verify: cannot fetch source full_text: {exc}")
        return ""
    parts: List[str] = []
    for row in rows or []:
        ft = row.get("full_text") if isinstance(row, dict) else None
        if ft:
            parts.append(str(ft))
    return "\n".join(parts)


async def _verify_course_codes(content: str, context: Dict[str, Any]) -> str:
    """
    Every code-like token the model emits must match a code found in CONTEXT
    or in the source's full_text (fetched from DB when the context blob is
    thin — e.g. "insights only" mode). Codes that don't match are wrapped
    with a visible warning so the reader sees the fabrication instead of
    the model's number being trusted at face value.

    Async because it may need to hit SurrealDB for a full_text fallback and
    callers are already async request handlers.
    """
    if not content:
        return content
    context_blob = "\n".join(_collect_context_texts(context))
    unwrapped = _unwrap_context(context)
    source_ids: List[str] = []
    for s in unwrapped.get("sources") or []:
        if isinstance(s, dict) and s.get("id"):
            source_ids.append(str(s["id"]))
    if source_ids:
        # Always augment with full_text from DB so context mode (insights vs
        # full content) doesn't change verification behaviour.
        context_blob = context_blob + "\n" + await _fetch_source_full_texts(source_ids)
    if not context_blob.strip():
        return content
    normalised_context = _normalise_code(context_blob)

    def _check(match: "re.Match[str]") -> str:
        token = match.group(0)
        if _normalise_code(token) in normalised_context:
            return token
        logger.info(f"Flagging unverified course code: {token}")
        return f"⚠️`{token}` (รหัสไม่พบในเอกสาร)"

    return _COURSE_CODE.sub(_check, content)


def _is_url_allowed(url: str, allowed_texts: List[str]) -> bool:
    """URL passes if it's on the KMITL allowlist OR appears verbatim in CONTEXT."""
    host_match = _URL_HOST_PATTERN.match(url)
    host = host_match.group(1).lower() if host_match else ""
    if host in _ALLOWED_URL_HOSTS:
        return True
    return any(url in t for t in allowed_texts)


def _filter_url_citations(content: str, context: Dict[str, Any]) -> str:
    """
    Strip URL citations of three shapes when the URL is not on the KMITL
    allowlist AND not present in the CONTEXT that was fed to the model:
      1. Markdown links `[label](url)` → replaced with just `label`.
      2. Bracketed citations `[url:...]` → removed entirely.
      3. Plain URLs `https://...` in prose → removed (trailing punctuation kept).
    Order matters: markdown links first, so plain-URL stripping doesn't leave
    a broken `[label]()` shell behind.
    """
    if not content:
        return content
    allowed_texts = _collect_context_texts(context)

    def _markdown(match: "re.Match[str]") -> str:
        label, url = match.group(1), match.group(2).strip()
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (markdown link): {url}")
        return label

    result = _MARKDOWN_LINK.sub(_markdown, content)

    def _bracketed(match: "re.Match[str]") -> str:
        url = match.group(1).strip()
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (bracketed): {url}")
        return ""

    result = _URL_CITATION.sub(_bracketed, result)

    def _plain(match: "re.Match[str]") -> str:
        url = match.group(0).rstrip(".,;:!?)]")
        trailing = match.group(0)[len(url):]
        if _is_url_allowed(url, allowed_texts):
            return match.group(0)
        logger.info(f"Stripping hallucinated URL citation (plain): {url}")
        return trailing

    return _PLAIN_URL.sub(_plain, result)


# =============================================================================
# Global Chat SSE Streaming endpoint
# =============================================================================

async def _pin_relevant_excerpts(
    context: Dict[str, Any], notebook_id: Optional[str], query: str
) -> Dict[str, Any]:
    """
    Semantic-search over the notebook's `source_embedding` chunks for the
    user's query and prepend the top matches to the CONTEXT as
    `context["relevant_excerpts"]`. The full-text sources stay intact
    underneath, so the model still has the whole document as fallback.
    Falls back silently if embeddings are missing or SurrealDB rejects the
    query — the model then just sees the full context as before.
    """
    if not notebook_id or not (query and query.strip()):
        return context
    unwrapped = _unwrap_context(context)
    sources = unwrapped.get("sources") or []
    if not sources:
        return context
    source_ids: List[Any] = []
    for s in sources:
        sid = s.get("id") if isinstance(s, dict) else None
        if sid:
            source_ids.append(sid)
    if not source_ids:
        return context

    try:
        from open_notebook.database.repository import ensure_record_id, repo_query
        from open_notebook.utils.embedding import generate_embedding

        embed = await generate_embedding(query)
        # Direct source_embedding search — avoids stored fn::vector_search_in_notebook
        # which is missing from this SurrealDB instance (migration mismatch).
        # Over-fetch (36) then dedupe in Python: chunks here are duplicated ~3x
        # from repeated embedding runs, so a small LIMIT starves the top-k of
        # unique passages and the model never sees the second-most-relevant
        # material. This was the root cause of "ปีที่ 1 ภาคการศึกษาที่ 2" being
        # reported as "not in document".
        rows = await repo_query(
            """
            SELECT source, content,
                   vector::similarity::cosine(embedding, $q) AS sim
            FROM source_embedding
            WHERE source IN $sources
              AND vector::similarity::cosine(embedding, $q) >= $min_sim
            ORDER BY sim DESC
            LIMIT 36
            """,
            {
                "q": embed,
                "sources": [ensure_record_id(sid) for sid in source_ids],
                "min_sim": 0.2,
            },
        )
    except Exception as exc:
        logger.warning(f"Skipping relevant-excerpt pinning: {exc}")
        return context

    title_by_id = {s.get("id"): s.get("title") for s in sources if isinstance(s, dict)}
    excerpts: List[Dict[str, Any]] = []
    seen_prefixes: set = set()
    max_excerpts = 6
    for row in rows or []:
        parent = str(row.get("source")) if row.get("source") is not None else None
        content_text = row.get("content") or ""
        if not content_text:
            continue
        # Chunks often overlap heavily and this DB has each chunk indexed ~3x
        # from repeated embed runs; dedupe by the first 120 chars so we don't
        # waste context on near-identical excerpts.
        key = str(content_text)[:120]
        if key in seen_prefixes:
            continue
        seen_prefixes.add(key)
        excerpts.append(
            {
                "parent_id": parent,
                "title": title_by_id.get(parent, ""),
                "similarity": float(row.get("sim") or 0.0),
                "text": str(content_text)[:1500],
            }
        )
        if len(excerpts) >= max_excerpts:
            break
    if excerpts:
        # Attach the excerpts inside whichever shape was passed. If we received
        # the /chat/context envelope, put them under `context.context` so the
        # prompt template's `{{ context.relevant_excerpts }}` lookup still hits.
        if unwrapped is context:
            context = {**context, "relevant_excerpts": excerpts}
        else:
            merged_inner = {**unwrapped, "relevant_excerpts": excerpts}
            context = {**context, "context": merged_inner, **merged_inner}
        logger.info(
            f"Pinned {len(excerpts)} relevant excerpt(s) for notebook {notebook_id}"
        )
    return context


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
