"""
User domain model + repository.

User accounts are stored in MariaDB (user service).
All other workspace data (notebooks, cells, podcasts, etc.) stays in SurrealDB.
Passwords are stored as bcrypt hashes; passwords are never returned through the API.
"""

from __future__ import annotations

import os as _os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

import bcrypt
from loguru import logger
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import Column, DateTime, Enum, Integer, String, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from open_notebook.config import get_mariadb_url


# =============================================================================
# SQLAlchemy setup for MariaDB
# =============================================================================

_Base = declarative_base()

class _UserRow(_Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    username      = Column(String(32), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name  = Column(String(128), nullable=True)
    role          = Column(Enum("admin", "student"), nullable=False, default="student")
    created_at    = Column(DateTime, default=datetime.utcnow)
    updated_at    = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login_at = Column(DateTime, nullable=True)

    __table_args__ = {"mysql_engine": "InnoDB", "mysql_charset": "utf8mb4"}



# Module-level engine + session factory (lazy, one per process)
_mariadb_engine: Optional[Any] = None
_mariadb_session_factory: Optional[Any] = None


def _get_engine():
    global _mariadb_engine
    if _mariadb_engine is None:
        _mariadb_engine = create_async_engine(
            get_mariadb_url(),
            echo=False,
            pool_size=5,
            max_overflow=10,
            pool_pre_ping=True,
        )
    return _mariadb_engine


def _get_session_factory():
    global _mariadb_session_factory
    if _mariadb_session_factory is None:
        _mariadb_session_factory = async_sessionmaker(
            bind=_get_engine(),
            class_=AsyncSession,
            expire_on_commit=False,
        )
    return _mariadb_session_factory


@asynccontextmanager
async def _mariadb_session() -> AsyncGenerator[AsyncSession, None]:
    """Async context manager for a MariaDB session."""
    factory = _get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# =============================================================================
# Constants
# =============================================================================

USERNAME_MIN_LEN = 3
USERNAME_MAX_LEN = 32
PASSWORD_MIN_LEN = int(_os.getenv("WORKSPACE_PASSWORD_MIN_LEN", "3"))
PASSWORD_MAX_LEN = 128
BCRYPT_ROUNDS = 12

USER_ROLE_ADMIN   = "admin"
USER_ROLE_STUDENT = "student"


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

    id: Optional[int] = None
    username: str
    password_hash: str = Field(exclude=True)
    display_name: Optional[str] = None
    role: str = "student"
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


def _row_to_user(row: Any) -> User:
    """Map a SQLAlchemy row into a User instance."""
    password_hash = getattr(row, "password_hash", "") or ""
    created_at = getattr(row, "created_at", None)
    updated_at = getattr(row, "updated_at", None)
    last_login = getattr(row, "last_login_at", None)

    return User(
        id=getattr(row, "id", None),
        username=getattr(row, "username", ""),
        password_hash=password_hash,
        display_name=getattr(row, "display_name", None),
        role=getattr(row, "role", "student"),
        created_at=created_at.isoformat() if created_at else None,
        updated_at=updated_at.isoformat() if updated_at else None,
        last_login_at=last_login.isoformat() if last_login else None,
    )


# =============================================================================
# Repository operations
# =============================================================================

async def get_by_username(username: str) -> Optional[User]:
    """Look up a user by username (case-insensitive)."""
    normalized = username.strip().lower()
    async with _mariadb_session() as session:
        result = await session.execute(
            select(_UserRow).where(_UserRow.username == normalized).limit(1)
        )
        row = result.scalar_one_or_none()
    if row is None:
        return None
    return _row_to_user(row)


async def get_by_id(user_id: int | str) -> Optional[User]:
    """Look up a user by their numeric id."""
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        return None

    async with _mariadb_session() as session:
        result = await session.execute(select(_UserRow).where(_UserRow.id == uid).limit(1))
        row = result.scalar_one_or_none()
    if row is None:
        return None
    return _row_to_user(row)


async def create(
    username: str,
    password: str,
    display_name: Optional[str] = None,
    role: str = "student",
) -> User:
    """Create a new user. Raises UserAlreadyExists on conflict."""
    normalized = username.strip().lower()
    password_hash = hash_password(password)
    now = datetime.utcnow()

    async with _mariadb_session() as session:
        existing = await session.execute(
            select(_UserRow).where(_UserRow.username == normalized).limit(1)
        )
        if existing.scalar_one_or_none() is not None:
            raise UserAlreadyExists(f"Username '{normalized}' is already taken")

        new_user = _UserRow(
            username=normalized,
            password_hash=password_hash,
            display_name=display_name,
            role=role,
            created_at=now,
            updated_at=now,
        )
        session.add(new_user)
        await session.flush()
        await session.refresh(new_user)

    return _row_to_user(new_user)


async def touch_last_login(user_id: int | str) -> None:
    """Update last_login_at to now (best-effort, errors are logged)."""
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        logger.warning(f"Invalid user_id for touch_last_login: {user_id}")
        return

    try:
        async with _mariadb_session() as session:
            await session.execute(
                update(_UserRow)
                .where(_UserRow.id == uid)
                .values(last_login_at=datetime.utcnow(), updated_at=datetime.utcnow())
            )
    except Exception as exc:
        logger.warning(f"Failed to update last_login_at for user {uid}: {exc}")


async def update_password(user_id: int | str, password: str) -> None:
    """Replace a user's password hash (used by deterministic local admin seeding)."""
    try:
        uid = int(user_id)
    except (ValueError, TypeError):
        raise UserError(f"Invalid user_id: {user_id}")

    password_hash = hash_password(password)
    async with _mariadb_session() as session:
        await session.execute(
            update(_UserRow)
            .where(_UserRow.id == uid)
            .values(password_hash=password_hash, updated_at=datetime.utcnow())
        )
