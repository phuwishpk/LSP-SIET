"""
Domain models for the bundled AI Feature Modules.

These tables power the add-on features that were folded in from
`My-ai-quiz` and `ai-roadmap-generator`. Every record is keyed by
`owner_id` so multi-user deployments can isolate data via the
existing password middleware plus an `owner_id` filter.
"""

from __future__ import annotations

from typing import Any, ClassVar, Dict, List, Optional

from loguru import logger
from pydantic import Field, field_validator

from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.base import ObjectModel
from open_notebook.exceptions import (
    DatabaseOperationError,
    InvalidInputError,
    NotFoundError,
)


class QuizSession(ObjectModel):
    table_name: ClassVar[str] = "quiz_session"
    nullable_fields: ClassVar[set[str]] = {"notebook_id", "model_id"}

    owner_id: str
    topic: str
    language: str = "th"
    question_count: int
    questions: List[Dict[str, Any]] = Field(default_factory=list)
    notebook_id: Optional[str] = None
    model_id: Optional[str] = None
    prompt_hash: str

    @field_validator("topic")
    @classmethod
    def topic_must_not_be_empty(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidInputError("Quiz topic cannot be empty")
        if len(cleaned) > 500:
            raise InvalidInputError("Quiz topic must be 500 characters or fewer")
        return cleaned

    @field_validator("question_count")
    @classmethod
    def question_count_must_be_in_range(cls, value: int) -> int:
        if value < 1 or value > 20:
            raise InvalidInputError("Question count must be between 1 and 20")
        return value

    @field_validator("owner_id")
    @classmethod
    def owner_id_required(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidInputError("owner_id cannot be empty")
        return cleaned

    @classmethod
    async def list_for_owner(
        cls,
        owner_id: str,
        limit: int = 50,
    ) -> List["QuizSession"]:
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        try:
            rows = await repo_query(
                """
                SELECT * FROM quiz_session
                WHERE owner_id = $owner
                ORDER BY created_at DESC
                LIMIT $limit
                """,
                {"owner": owner_id, "limit": limit},
            )
            return [cls(**row) for row in rows]
        except Exception as exc:
            logger.error(f"Failed listing quiz sessions for {owner_id}: {exc}")
            logger.exception(exc)
            raise DatabaseOperationError(exc)

    @classmethod
    async def get_for_owner(cls, session_id: str, owner_id: str) -> "QuizSession":
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        try:
            rows = await repo_query(
                "SELECT * FROM $id WHERE owner_id = $owner",
                {"id": ensure_record_id(session_id), "owner": owner_id},
            )
            if not rows:
                raise NotFoundError(f"Quiz session {session_id} not found")
            return cls(**rows[0])
        except NotFoundError:
            raise
        except Exception as exc:
            logger.error(f"Failed loading quiz session {session_id}: {exc}")
            logger.exception(exc)
            raise DatabaseOperationError(exc)

    async def delete_for_owner(self, owner_id: str) -> bool:
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        if self.owner_id != owner_id:
            # Prevent cross-user deletion by short-circuiting
            raise NotFoundError("Quiz session not found")
        return await self.delete()


class RoadmapSession(ObjectModel):
    table_name: ClassVar[str] = "roadmap_session"
    nullable_fields: ClassVar[set[str]] = {"notebook_id", "model_id"}

    owner_id: str
    title: str
    description: str
    language: str = "th"
    node_count: int
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
    notebook_id: Optional[str] = None
    model_id: Optional[str] = None
    prompt_hash: str

    @field_validator("title")
    @classmethod
    def title_must_not_be_empty(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidInputError("Roadmap title cannot be empty")
        if len(cleaned) > 200:
            raise InvalidInputError("Roadmap title must be 200 characters or fewer")
        return cleaned

    @field_validator("description")
    @classmethod
    def description_must_be_reasonable(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidInputError("Roadmap description cannot be empty")
        if len(cleaned) > 2000:
            raise InvalidInputError("Roadmap description must be 2000 characters or fewer")
        return cleaned

    @field_validator("node_count")
    @classmethod
    def node_count_must_be_in_range(cls, value: int) -> int:
        if value < 3 or value > 50:
            raise InvalidInputError("Node count must be between 3 and 50")
        return value

    @field_validator("owner_id")
    @classmethod
    def owner_id_required(cls, value: str) -> str:
        cleaned = (value or "").strip()
        if not cleaned:
            raise InvalidInputError("owner_id cannot be empty")
        return cleaned

    @classmethod
    async def list_for_owner(
        cls,
        owner_id: str,
        limit: int = 50,
    ) -> List["RoadmapSession"]:
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        try:
            rows = await repo_query(
                """
                SELECT * FROM roadmap_session
                WHERE owner_id = $owner
                ORDER BY created_at DESC
                LIMIT $limit
                """,
                {"owner": owner_id, "limit": limit},
            )
            return [cls(**row) for row in rows]
        except Exception as exc:
            logger.error(f"Failed listing roadmap sessions for {owner_id}: {exc}")
            logger.exception(exc)
            raise DatabaseOperationError(exc)

    @classmethod
    async def get_for_owner(cls, session_id: str, owner_id: str) -> "RoadmapSession":
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        try:
            rows = await repo_query(
                "SELECT * FROM $id WHERE owner_id = $owner",
                {"id": ensure_record_id(session_id), "owner": owner_id},
            )
            if not rows:
                raise NotFoundError(f"Roadmap session {session_id} not found")
            return cls(**rows[0])
        except NotFoundError:
            raise
        except Exception as exc:
            logger.error(f"Failed loading roadmap session {session_id}: {exc}")
            logger.exception(exc)
            raise DatabaseOperationError(exc)

    async def delete_for_owner(self, owner_id: str) -> bool:
        if not owner_id:
            raise InvalidInputError("owner_id is required")
        if self.owner_id != owner_id:
            raise NotFoundError("Roadmap session not found")
        return await self.delete()
