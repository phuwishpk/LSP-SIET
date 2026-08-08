"""
User domain model + repository.

The workspace uses SurrealDB to persist registered accounts.
Passwords are stored as bcrypt hashes; passwords are never returned
through the API. Lookups are case-insensitive on `username` so users
can type whatever casing they like on the login form.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import bcrypt
from loguru import logger
from pydantic import BaseModel, Field, field_validator

from open_notebook.database.repository import (
    db_connection,
    ensure_record_id,
    parse_record_ids,
)


# =============================================================================
# Constants
# =============================================================================


USERNAME_MIN_LEN = 3
USERNAME_MAX_LEN = 32
# Allow short passwords for local dev convenience (admin/123). Production
# deployments should set WORKSPACE_PASSWORD_MIN_LEN to a higher value.
import os as _os

PASSWORD_MIN_LEN = int(_os.getenv("WORKSPACE_PASSWORD_MIN_LEN", "3"))
PASSWORD_MAX_LEN = 128
BCRYPT_ROUNDS = 12


# =============================================================================
# Exceptions
# =============================================================================


class UserError(Exception):
    """Base error for user operations."""


class UserAlreadyExists(UserError):
    """Raised when a username is taken."""


class UserNotFound(UserError):
    """Raised when lookup fails."""


class InvalidCredentials(UserError):
    """Raised on bad username/password."""


class InvalidUsernameError(UserError):
    """Raised when the username fails validation."""


class InvalidPasswordError(UserError):
    """Raised when the password fails validation."""


# =============================================================================
# Pydantic schema
# =============================================================================


class User(BaseModel):
    """In-memory representation of a stored user."""

    id: Optional[str] = None
    username: str
    password_hash: str = Field(exclude=True)
    display_name: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_login_at: Optional[str] = None

    @field_validator("username")
    @classmethod
    def _normalize_username(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not (USERNAME_MIN_LEN <= len(normalized) <= USERNAME_MAX_LEN):
            raise InvalidUsernameError(
                f"Username must be {USERNAME_MIN_LEN}-{USERNAME_MAX_LEN} characters"
            )
        if not all(ch.isalnum() or ch in "._-" for ch in normalized):
            raise InvalidUsernameError(
                "Username may only contain letters, digits, dots, underscores and dashes"
            )
        return normalized


# =============================================================================
# Helpers
# =============================================================================


def hash_password(plain: str) -> str:
    """Hash a plaintext password using bcrypt."""
    if not (PASSWORD_MIN_LEN <= len(plain) <= PASSWORD_MAX_LEN):
        raise InvalidPasswordError(
            f"Password must be {PASSWORD_MIN_LEN}-{PASSWORD_MAX_LEN} characters"
        )
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(plain.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Constant-time bcrypt verification."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _row_to_user(row: Dict[str, Any]) -> User:
    """Map a SurrealDB row into a User instance."""
    password_hash = row.get("password_hash") or row.get("password") or ""
    return User(
        id=row.get("id"),
        username=row.get("username", ""),
        password_hash=password_hash,
        display_name=row.get("display_name"),
        created_at=str(row.get("created_at")) if row.get("created_at") else None,
        updated_at=str(row.get("updated_at")) if row.get("updated_at") else None,
        last_login_at=str(row.get("last_login_at")) if row.get("last_login_at") else None,
    )


# =============================================================================
# Repository operations
# =============================================================================


async def get_by_username(username: str) -> Optional[User]:
    """Look up a user by username (case-insensitive)."""
    normalized = username.strip().lower()
    rows = await _query(
        "SELECT * FROM user WHERE username = $username LIMIT 1",
        {"username": normalized},
    )
    if not rows:
        return None
    return _row_to_user(rows[0])


async def get_by_id(user_id: str) -> Optional[User]:
    """Look up a user by their record id (e.g. user:abc123)."""
    try:
        rows = await _query(
            "SELECT * FROM $id LIMIT 1",
            {"id": ensure_record_id(user_id)},
        )
    except Exception as exc:
        logger.debug(f"User lookup failed for id {user_id}: {exc}")
        return None
    if not rows:
        return None
    return _row_to_user(rows[0])


async def create(username: str, password: str, display_name: Optional[str] = None) -> User:
    """Create a new user. Raises UserAlreadyExists on conflict."""
    normalized = username.strip().lower()
    existing = await get_by_username(normalized)
    if existing is not None:
        raise UserAlreadyExists(f"Username '{normalized}' is already taken")

    password_hash = hash_password(password)
    now = datetime.now(timezone.utc).isoformat()

    async with db_connection() as connection:
        result = parse_record_ids(
            await connection.insert(
                "user",
                {
                    "username": normalized,
                    "password_hash": password_hash,
                    "display_name": display_name,
                    "created_at": now,
                    "updated_at": now,
                },
            )
        )

    if isinstance(result, str):
        raise UserError(result)
    if not result:
        raise UserError("Insert returned no rows")

    record = result[0] if isinstance(result, list) else result
    return _row_to_user(record)


async def touch_last_login(user_id: str) -> None:
    """Update last_login_at to now (best-effort, errors are logged)."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        async with db_connection() as connection:
            await connection.query(
                "UPDATE $id SET last_login_at = $now, updated_at = $now",
                {"id": ensure_record_id(user_id), "now": now},
            )
    except Exception as exc:
        logger.warning(f"Failed to update last_login_at for {user_id}: {exc}")


async def _query(query_str: str, vars: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
    async with db_connection() as connection:
        result = parse_record_ids(await connection.query(query_str, vars))
    if isinstance(result, str):
        raise UserError(result)
    return result or []