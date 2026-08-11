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

from api.dependencies import _resolve_owner_id
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

        messages: List[ChatMessage] = []
        for msg in raw_messages:
            messages.append(
                ChatMessage(
                    id=getattr(msg, "id", f"msg_{len(messages)}"),
                    type=msg.type if hasattr(msg, "type") else "unknown",
                    content=msg.content if hasattr(msg, "content") else str(msg),
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

        # Get current LangGraph state
        current_state = await asyncio.to_thread(
            chat_graph.get_state,
            config=RunnableConfig(configurable={"thread_id": full_session_id}),
        )
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        state_values["context"] = request.context
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

        # Convert messages
        messages: List[ChatMessage] = []
        for msg in result.get("messages", []):
            messages.append(
                ChatMessage(
                    id=getattr(msg, "id", f"msg_{len(messages)}"),
                    type=msg.type if hasattr(msg, "type") else "unknown",
                    content=msg.content if hasattr(msg, "content") else str(msg),
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
        if getattr(notebook, "owner_id", None) and notebook.owner_id != owner_id:
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
        if getattr(notebook, "owner_id", None) and notebook.owner_id != owner_id:
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

        # Extract messages from state
        messages: list[ChatMessage] = []
        if thread_state and thread_state.values and "messages" in thread_state.values:
            for msg in thread_state.values["messages"]:
                messages.append(
                    ChatMessage(
                        id=getattr(msg, "id", f"msg_{len(messages)}"),
                        type=msg.type if hasattr(msg, "type") else "unknown",
                        content=msg.content if hasattr(msg, "content") else str(msg),
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

        # Prepare state for execution
        state_values = current_state.values if current_state else {}
        state_values["messages"] = state_values.get("messages", [])
        state_values["context"] = request.context
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

        # Convert messages to response format
        messages: list[ChatMessage] = []
        for msg in result.get("messages", []):
            messages.append(
                ChatMessage(
                    id=getattr(msg, "id", f"msg_{len(messages)}"),
                    type=msg.type if hasattr(msg, "type") else "unknown",
                    content=msg.content if hasattr(msg, "content") else str(msg),
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
# Global Chat SSE Streaming endpoint
# =============================================================================

async def _stream_global_chat_response(
    session_id: str,
    message: str,
    context: Dict[str, Any],
    model_override: Optional[str] = None,
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

        # Emit AI messages
        for msg in result.get("messages", []):
            if hasattr(msg, "type") and msg.type == "ai":
                yield f"data: {json.dumps({'type': 'ai_message', 'content': msg.content})}\n\n"

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
