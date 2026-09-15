"""
Workspace user/auth router.

Endpoints
---------
* ``POST /api/users/register``  – create a new account
* ``POST /api/users/login``     – exchange username/password for a JWT
* ``POST /api/users/logout``    – stateless logout (client discards token)
* ``GET  /api/users/me``        – return the authenticated user
* ``GET  /api/auth/status``     – whether JWT auth is enabled + lightweight probe
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from loguru import logger
from pydantic import BaseModel, Field

from api.login_guard import (
    check_login_allowed,
    check_registration_allowed,
    clear_login_failures,
    record_login_failure,
    record_registration,
)
from api.auth_jwt import (
    get_current_user,
    issue_access_token,
    jwt_auth_enabled,
    optional_current_user,
)
from open_notebook.community import points
from open_notebook.domain.user import (
    InvalidCredentials,
    InvalidPasswordError,
    InvalidUsernameError,
    User,
    UserAlreadyExists,
    create as create_user,
    get_by_id,
    get_by_username,
    touch_last_login,
    verify_password,
)


router = APIRouter(tags=["users"])


# =============================================================================
# Pydantic request/response schemas
# =============================================================================


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)
    display_name: Optional[str] = Field(default=None, max_length=64)


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=1, max_length=128)


class UserResponse(BaseModel):
    """Public projection of a user (never includes password_hash)."""

    id: str
    username: str
    display_name: Optional[str] = None
    role: str = "student"
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    student_id: Optional[str] = None
    points_balance: int = 0
    points_exempt: bool = False
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_at: int  # unix timestamp (seconds)
    user: UserResponse


class AuthStatusResponse(BaseModel):
    jwt_auth_enabled: bool
    registration_enabled: bool
    auth_required: bool
    google_login_enabled: bool = False
    google_login_mock: bool = False
    allowed_domains: list[str] = []
    user: Optional[UserResponse] = None


# =============================================================================
# Helpers
# =============================================================================


def _to_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id) if user.id is not None else "",
        username=user.username,
        display_name=user.display_name,
        role=user.role or "student",
        email=user.email,
        avatar_url=user.avatar_url,
        student_id=user.student_id,
        points_balance=int(user.points_balance or 0),
        points_exempt=user.is_points_exempt,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    )


async def _with_welcome(user: User) -> User:
    """Grant the one-time welcome allowance and return the refreshed user."""
    try:
        await points.ensure_welcome(user)
        fresh = await get_by_id(user.id or 0)
        return fresh or user
    except Exception as exc:  # never block login on wallet errors
        logger.warning(f"welcome points skipped for {user.username}: {exc}")
        return user


def _registration_enabled() -> bool:
    """Registration is allowed unless explicitly disabled."""
    from os import getenv

    return getenv("WORKSPACE_DISABLE_REGISTRATION", "").lower() not in {
        "1",
        "true",
        "yes",
    }


# =============================================================================
# Routes
# =============================================================================


@router.get("/auth/status", response_model=AuthStatusResponse)
async def auth_status(
    request: Request,
    user: Optional[User] = Depends(optional_current_user),
) -> AuthStatusResponse:
    """Lightweight probe that the frontend uses to decide where to redirect."""
    enabled = jwt_auth_enabled()
    from api.routers.google_auth import (
        allowed_domains,
        google_config_ready,
        google_login_enabled,
        google_mock_enabled,
    )

    return AuthStatusResponse(
        jwt_auth_enabled=enabled,
        registration_enabled=_registration_enabled(),
        auth_required=enabled,
        google_login_enabled=google_login_enabled(),
        google_login_mock=google_login_enabled() and not google_config_ready() and google_mock_enabled(),
        allowed_domains=allowed_domains(),
        user=_to_response(user) if user else None,
    )


@router.post("/users/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request) -> TokenResponse:
    await check_registration_allowed(request)
    if not jwt_auth_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT auth is not configured (set JWT_SECRET)",
        )
    if not _registration_enabled():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is disabled",
        )
    try:
        user = await create_user(
            username=payload.username,
            password=payload.password,
            display_name=payload.display_name,
        )
    except UserAlreadyExists as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        )
    except (InvalidUsernameError, InvalidPasswordError) as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        )

    await record_registration(request)
    user = await _with_welcome(user)
    access_token, expires_at = issue_access_token(user)
    return TokenResponse(access_token=access_token, expires_at=expires_at, user=_to_response(user))


@router.post("/users/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request) -> TokenResponse:
    if not jwt_auth_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT auth is not configured (set JWT_SECRET)",
        )

    # Checked before the password so a locked-out attacker cannot keep guessing.
    await check_login_allowed(payload.username, request)

    user = await get_by_username(payload.username)
    if user is not None and user.disabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
        )
    if user is None or not verify_password(payload.password, user.password_hash):
        # Run verify_password against a dummy hash to keep timing constant
        verify_password(payload.password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv")
        await record_login_failure(payload.username, request)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    await clear_login_failures(payload.username)
    user = await _with_welcome(user)
    access_token, expires_at = issue_access_token(user)
    await touch_last_login(user.id or "")
    return TokenResponse(access_token=access_token, expires_at=expires_at, user=_to_response(user))


@router.post("/users/logout")
async def logout() -> dict:
    """Stateless logout. The client simply discards the token."""
    return {"ok": True}


@router.get("/users/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:
    return _to_response(user)


# =============================================================================
# Compatibility shim for the old ``/api/auth/status`` path
# =============================================================================


@router.get("/auth/legacy-status")
async def legacy_auth_status() -> dict:
    """Backwards-compat alias used by the older frontend password probe."""
    return {"auth_enabled": jwt_auth_enabled()}