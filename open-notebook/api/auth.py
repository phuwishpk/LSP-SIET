from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from open_notebook.utils.encryption import get_secret_from_env


# ----------------------------------------------------------------------------
# JWT helpers used by the workspace auth flow.
# We import them lazily here to avoid a circular dependency with api.auth_jwt
# (which itself imports from this module via `get_current_user`).
# ----------------------------------------------------------------------------


def _jwt_enabled() -> bool:
    secret = get_secret_from_env("JWT_SECRET") or get_secret_from_env(
        "OPEN_NOTEBOOK_ENCRYPTION_KEY"
    )
    return bool(secret)


def _try_resolve_jwt(token: str) -> Optional[str]:
    """Decode a JWT and return the user id (subject) on success, else None."""
    try:
        from api.auth_jwt import JWT_AUDIENCE, JWT_ISSUER, decode_access_token

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


class PasswordAuthMiddleware(BaseHTTPMiddleware):
    """
    Middleware to check password authentication for all API requests.
    Always active with default password if OPEN_NOTEBOOK_PASSWORD is not set.
    Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    """

    def __init__(
        self, app: ASGIApp, excluded_paths: Optional[list[str]] = None
    ) -> None:
        super().__init__(app)
        self.password = get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")
        self.excluded_paths: list[str] = excluded_paths or [
            "/",
            "/health",
            "/docs",
            "/openapi.json",
            "/redoc",
            # Workspace user/auth endpoints must be reachable without a token so
            # the frontend can probe auth state and perform the initial login.
            "/api/users/login",
            "/api/users/register",
            "/api/users/logout",
            "/api/auth/status",
            "/api/auth/legacy-status",
            "/api/config",
        ]

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        # Skip authentication if neither password nor JWT secret is configured
        if not self.password and not _jwt_enabled():
            return await call_next(request)

        # Skip authentication for excluded paths
        if request.url.path in self.excluded_paths:
            return await call_next(request)

        # Skip authentication for CORS preflight requests (OPTIONS)
        if request.method == "OPTIONS":
            return await call_next(request)

        # Check authorization header
        auth_header = request.headers.get("Authorization")

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
            if not self.password:
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Invalid or expired access token"},
                    headers={"WWW-Authenticate": "Bearer"},
                )

        # 2) Fall back to the legacy single-password gate (single-user setups
        #    that haven't enabled JWT auth yet).
        if self.password and credentials == self.password:
            # Stamp a synthetic owner id so feature endpoints still scope by user
            request.state.owner_id = f"password:{_hash_owner_id(self.password)}"
            return await call_next(request)

        return JSONResponse(
            status_code=401,
            content={"detail": "Invalid authorization"},
            headers={"WWW-Authenticate": "Bearer"},
        )


# Optional: HTTPBearer security scheme for OpenAPI documentation
security = HTTPBearer(auto_error=False)


def check_api_password(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> bool:
    """
    Utility function to check API password.
    Can be used as a dependency in individual routes if needed.
    Supports Docker secrets via OPEN_NOTEBOOK_PASSWORD_FILE.
    Returns True without checking credentials if OPEN_NOTEBOOK_PASSWORD is not configured.
    Raises 401 if credentials are missing or don't match the configured password.
    """
    password = get_secret_from_env("OPEN_NOTEBOOK_PASSWORD")

    # No password configured - skip authentication
    if not password:
        return True

    # No credentials provided
    if not credentials:
        raise HTTPException(
            status_code=401,
            detail="Missing authorization",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check password
    if credentials.credentials != password:
        raise HTTPException(
            status_code=401,
            detail="Invalid password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True
