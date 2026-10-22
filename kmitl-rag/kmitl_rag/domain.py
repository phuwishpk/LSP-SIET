"""SurrealDB records owned by KMITL RAG."""

from typing import ClassVar, List, Optional

from open_notebook.database.repository import repo_query
from open_notebook.domain.base import ObjectModel


# -----------------------------------------------------------------------------
# GlobalChatSession — independent of any notebook; used by the /search Ask tab
# -----------------------------------------------------------------------------

class GlobalChatSession(ObjectModel):
    """
    A chat session that exists outside of any notebook.
    Used by the persistent Chat UI on the Ask tab of the /search page.

    User isolation is via owner_id (set from auth token at creation).
    LangGraph checkpoints persist messages across requests using the session ID
    as thread_id, so the same chat_graph.checkpointer used by ChatSession
    handles both tables transparently.
    """
    table_name: ClassVar[str] = "global_chat_session"
    nullable_fields: ClassVar[set[str]] = {"title", "model_override", "owner_id"}
    title: Optional[str] = None
    model_override: Optional[str] = None
    owner_id: Optional[str] = None

    @classmethod
    async def get_global_sessions(cls, owner_id: str) -> List["GlobalChatSession"]:
        """
        Return all global chat sessions for a given owner, ordered by updated desc.
        Falls back to sessions with no owner_id (legacy / pre-migration).
        """
        try:
            results = await repo_query(
                """
                SELECT * FROM global_chat_session
                WHERE owner_id = $owner_id
                    OR owner_id = NONE
                ORDER BY updated DESC
                """,
                {"owner_id": owner_id}
            )
            return [
                cls(**src)
                for src in results
            ] if results else []
        except RuntimeError:
            # Table may not exist yet — return empty list until migration runs
            return []
