"""
Request authentication for the SIET workspace, installed into
``api.auth.PasswordAuthMiddleware`` through ``extensions.set_auth_backend``.

A workspace JWT (siet_platform.auth_jwt) authenticates the request and names
its owner (``request.state.owner_id``); the single open-notebook password
still works as a fallback for setups without JWT. File routes also accept the
token as ``?token=`` because links cannot carry a header.
"""

from typing import Optional

import jwt
from fastapi import Request
from fastapi.responses import JSONResponse
from loguru import logger
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

from open_notebook.utils.encryption import get_secret_from_env

# Reachable without a token, on top of open-notebook's own excluded paths, so
# the frontend can probe auth state and complete the first login.
PUBLIC_PATHS = {
    "/api/auth/legacy-status",
    "/api/users/login",
    "/api/users/register",
    "/api/users/logout",
    "/api/auth/google/start",
    "/api/auth/google/exchange",
}


def _jwt_enabled() -> bool:
    secret = get_secret_from_env("JWT_SECRET") or get_secret_from_env(
        "OPEN_NOTEBOOK_ENCRYPTION_KEY"
    )
    return bool(secret)


def _try_resolve_jwt(token: str) -> Optional[str]:
    """Decode a JWT and return the user id (subject) on success, else None."""
    try:
        from siet_platform.auth_jwt import JWT_AUDIENCE, JWT_ISSUER, decode_access_token

        secret = get_secret_from_env("JWT_SECRET") or get_secret_from_env(
            "OPEN_NOTEBOOK_ENCRYPTION_KEY"
        )
        if not secret:
            return None
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=JWT_AUDIENCE,
            issuer=JWT_ISSUER,
        )
        subject = payload.get("sub")
        return str(subject) if subject else None
    except jwt.ExpiredSignatureError:
        return None
    except jwt.PyJWTError:
        return None
    except Exception as exc:  # pragma: no cover - defensive
        logger.debug(f"JWT decode failed: {exc}")
        return None


def _hash_owner_id(value: str) -> str:
    """Stable, opaque owner id when only the password gate is configured."""
    import hashlib

    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def accepts_query_token(path: str) -> bool:
    """Routes that serve files and therefore may authenticate from ``?token=``."""
    return path.endswith("/download") or path.endswith("/attachment")


class WorkspaceAuthBackend:
    async def dispatch(
        self, middleware, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip authentication if neither password nor JWT secret is configured
        if not middleware.password and not _jwt_enabled():
            return await call_next(request)

        # Skip authentication for excluded paths
        excluded = set(middleware.excluded_paths) | PUBLIC_PATHS
        if request.url.path in excluded:
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")
        # File links (<a href>, <img src>, <video src>) cannot carry a header,
        # so the download routes also take the bearer token as ?token=. GET
        # only, and only on those routes, to keep tokens out of other URLs.
        if not auth_header and request.method == "GET" and accepts_query_token(request.url.path):
            query_token = request.query_params.get("token")
            if query_token:
                auth_header = f"Bearer {query_token}"

        if not auth_header:
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing authorization header"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # Expected format: "Bearer {credentials}"
        try:
            scheme, credentials = auth_header.split(" ", 1)
            if scheme.lower() != "bearer":
                raise ValueError("Invalid authentication scheme")
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Invalid authorization header format"},
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 1) Prefer JWT auth when configured. A valid JWT both authenticates
        #    the request and identifies the owner, so the per-route dependency
        #    can pick up the `X-Owner-Id` header below without re-validating.
        if _jwt_enabled():
            owner_id = _try_resolve_jwt(credentials)
            if owner_id:
                request.state.owner_id = owner_id
                return await call_next(request)
            # No JWT secret mismatch should 401 immediately – we don't want a
            # caller with a stray password gate value to slip through.
            if not middleware.password:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or expired access token"},
                    headers={"WWW-Authenticate": "Bearer"},
                )

        # 2) Fall back to the legacy single-password gate (single-user setups
        #    that haven't enabled JWT auth yet).
        if middleware.password and credentials == middleware.password:
            # Stamp a synthetic owner id so feature endpoints still scope by user
            request.state.owner_id = f"password:{_hash_owner_id(middleware.password)}"
            return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid authorization"},
            headers={"WWW-Authenticate": "Bearer"},
        )
