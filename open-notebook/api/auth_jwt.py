"""
JWT helpers for the workspace auth layer.

* Issues short-lived access tokens (`auth_token`) containing
  ``sub = user:<record_id>`` and ``username``.
* Provides a FastAPI dependency ``get_current_user`` that resolves the
  Bearer token, returns a ``User`` and stores the resolved record id on
  ``request.state.owner_id`` so downstream code can reuse it as the
  ``X-Owner-Id`` filter without re-parsing the token.
* A second dependency ``optional_current_user`` returns ``None`` instead
  of raising 401 for endpoints that want to behave differently when
  the visitor is anonymous (e.g. ``GET /api/auth/status``).
"""

from __future__ import annotations

import os
import time
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger

from open_notebook.domain.user import User, get_by_id
from open_notebook.utils.encryption import get_secret_from_env


# =============================================================================
# Configuration
# =============================================================================


JWT_ALGORITHM = "HS256"
JWT_ISSUER = "open-notebook-workspace"
JWT_AUDIENCE = "kmitlai-workspace"

# Defaults: 7 days. Override with JWT_ACCESS_TOKEN_TTL_SECONDS.
DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7


def get_jwt_secret() -> Optional[str]:
    """
    Resolve the signing secret.

    Priority: ``JWT_SECRET`` env -> ``OPEN_NOTEBOOK_ENCRYPTION_KEY`` (reuse
    the existing app-wide secret) -> ``None`` (JWT auth disabled).
    """
    secret = get_secret_from_env("JWT_SECRET")
    if secret:
        return secret
    return get_secret_from_env("OPEN_NOTEBOOK_ENCRYPTION_KEY")


def get_token_ttl() -> int:
    raw = os.getenv("JWT_ACCESS_TOKEN_TTL_SECONDS")
    if not raw:
        return DEFAULT_ACCESS_TOKEN_TTL_SECONDS
    try:
        value = int(raw)
    except ValueError:
        logger.warning(
            f"Invalid JWT_ACCESS_TOKEN_TTL_SECONDS={raw!r}; using default "
            f"{DEFAULT_ACCESS_TOKEN_TTL_SECONDS}"
        )
        return DEFAULT_ACCESS_TOKEN_TTL_SECONDS
    return max(60, value)


# =============================================================================
# Issue / verify tokens
# =============================================================================


def issue_access_token(user: User) -> tuple[str, int]:
    """
    Sign and return ``(jwt, expires_at_unix_timestamp)``.
    """
    ttl = get_token_ttl()
    issued_at = int(time.time())
    expires_at = issued_at + ttl
    payload = {
        "sub": user.id,
        "username": user.username,
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "iat": issued_at,
        "exp": expires_at,
    }
    secret = get_jwt_secret()
    if not secret:
        raise RuntimeError(
            "Cannot issue JWT: set JWT_SECRET or OPEN_NOTEBOOK_ENCRYPTION_KEY"
        )
    token = jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)
    return token, expires_at


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT, raising ``jwt.PyJWTError`` on failure."""
    secret = get_jwt_secret()
    if not secret:
        raise jwt.InvalidTokenError("JWT signing secret is not configured")
    return jwt.decode(
        token,
        secret,
        algorithms=[JWT_ALGORITHM],
        audience=JWT_AUDIENCE,
        issuer=JWT_ISSUER,
    )


# =============================================================================
# FastAPI dependencies
# =============================================================================


_bearer_scheme = HTTPBearer(auto_error=False)


def _credentials_from_request(
    credentials: Optional[HTTPAuthorizationCredentials],
    request: Request,
) -> Optional[str]:
    """Read the bearer token from header or ``?token=`` query string."""
    if credentials and credentials.scheme.lower() == "bearer" and credentials.credentials:
        return credentials.credentials
    # Allow the token to ride on the query string for cross-app deep-links
    # (My-ai-quiz / ai-roadmap-generator receive a ?token=… from the
    # dashboard and forward it through cookies / localStorage).
    query_token = request.query_params.get("token")
    if query_token:
        return query_token
    return None


def _resolve_user_from_token(token: str) -> Optional[User]:
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        return None
    except jwt.PyJWTError as exc:
        logger.debug(f"Invalid JWT: {exc}")
        return None

    subject = payload.get("sub")
    if not subject:
        return None
    return get_by_id(subject)


def set_request_owner(request: Request, owner_id: str) -> None:
    """Stash the resolved owner on the request state for downstream code."""
    request.state.owner_id = owner_id


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> User:
    """FastAPI dependency: returns the authenticated user or raises 401."""
    token = _credentials_from_request(credentials, request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = _resolve_user_from_token(token)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    set_request_owner(request, user.id or "")
    return user


async def optional_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> Optional[User]:
    """FastAPI dependency: returns the user if a valid token is present, else None."""
    token = _credentials_from_request(credentials, request)
    if not token:
        return None
    user = _resolve_user_from_token(token)
    if user is not None:
        set_request_owner(request, user.id or "")
    return user


def jwt_auth_enabled() -> bool:
    """Whether JWT-based auth is wired up (i.e. a secret is available)."""
    return bool(get_jwt_secret())