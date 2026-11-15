"""
QuizSession: a generated quiz, keyed by ``owner_id`` so every read and delete is
scoped to its owner (table ``quiz_session``, migration k2).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, ClassVar, Dict, List, Optional

from loguru import logger
from pydantic import Field, field_validator

from siet_core.database.repository import ensure_record_id, repo_query
from siet_core.domain.base import ObjectModel
from siet_core.exceptions import (
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

    @classmethod
    async def admin_list(
        cls,
        *,
        query: Optional[str] = None,
        origin: str = "all",
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Every quiz in the workspace, newest first, WITHOUT its questions: the
        admin console shows who made what, not the answers of a private quiz.
        """
        where: List[str] = []
        params: Dict[str, Any] = {"limit": int(limit), "offset": int(offset)}
        if query and query.strip():
            where.append("string::lowercase(topic) CONTAINS $q")
            params["q"] = query.strip().lower()
        if origin == "imported":
            where.append("string::starts_with(prompt_hash, 'import:')")
        elif origin == "own":
            where.append("!string::starts_with(prompt_hash, 'import:')")
        clause = f"WHERE {' AND '.join(where)}" if where else ""
        try:
            rows = await repo_query(
                f"""
                SELECT id, owner_id, topic, language, question_count, prompt_hash,
                       notebook_id, created_at
                  FROM quiz_session {clause}
                 ORDER BY created_at DESC
                 LIMIT $limit START $offset
                """,
                params,
            )
            total = await repo_query(
                f"SELECT count() AS n FROM quiz_session {clause} GROUP ALL", params
            )
        except Exception as exc:
            logger.error(f"Failed listing quiz sessions for admin: {exc}")
            raise DatabaseOperationError(exc)
        return {"items": rows or [], "total": int((total or [{}])[0].get("n") or 0)}

    @classmethod
    async def created_since(cls, since: datetime) -> List[Dict[str, Any]]:
        """Creation time, origin marker and size of every quiz made since ``since``."""
        try:
            return await repo_query(
                "SELECT prompt_hash, question_count, notebook_id, created_at "
                "FROM quiz_session WHERE created_at >= $since",
                {"since": since},
            ) or []
        except Exception as exc:
            logger.error(f"Failed reading quiz statistics: {exc}")
            raise DatabaseOperationError(exc)
