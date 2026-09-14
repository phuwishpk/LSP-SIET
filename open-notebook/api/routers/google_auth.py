"""
Google Workspace (@kmitl.ac.th) single sign-on.

Flow (the browser never talks to this API with Google's code directly):

1. ``GET  /api/auth/google/start?next=/community``
   → ``{"url": <google consent url>, "state": <signed state>, "mock": false}``
   The frontend simply navigates to ``url``.
2. Google redirects the browser back to ``${FRONTEND_URL}/auth/google/callback?code=…&state=…``
3. The frontend page POSTs ``{code, state}`` to
   ``POST /api/auth/google/exchange`` and receives a workspace JWT + user.

Environment variables
---------------------
GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET   Google Cloud OAuth client
GOOGLE_OAUTH_REDIRECT_URI     defaults to ``${FRONTEND_URL}/auth/google/callback``
GOOGLE_OAUTH_ALLOWED_DOMAINS  comma separated, default ``kmitl.ac.th``
GOOGLE_OAUTH_MOCK             ``1`` enables a local mock (no Google account needed –
                              the frontend shows a form asking for an e-mail). DEV ONLY.
FRONTEND_URL                  default ``http://localhost:3000``
KMITL_STUDENT_EMAIL_REGEX     local-part regex that identifies a student
                              (default ``^\\d{8}$`` e.g. 67030123@kmitl.ac.th)
WORKSPACE_ADMIN_EMAILS        comma separated e-mails that get the admin role
"""

from __future__ import annotations

import os
import re
import secrets
import time
from typing import Optional, Tuple
from urllib.parse import urlencode

import httpx
import jwt
from fastapi import APIRouter, HTTPException, status
from loguru import logger
from pydantic import BaseModel, Field

from api.auth_jwt import (
    JWT_ALGORITHM,
    get_jwt_secret,
    issue_access_token,
    jwt_auth_enabled,
)
from api.routers.users import TokenResponse, _to_response
from open_notebook.community import points
from open_notebook.domain.user import (
    USER_ROLE_ADMIN,
    USER_ROLE_STUDENT,
    USER_ROLE_TEACHER,
    User,
    UserAlreadyExists,
    create_sso_user,
    get_by_email,
    get_by_google_sub,
    get_by_id,
    touch_last_login,
    update_profile,
    username_available,
)

router = APIRouter(prefix="/auth/google", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
STATE_TTL_SECONDS = 600


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------


def _truthy(name: str) -> bool:
    return (os.getenv(name) or "").strip().lower() in {"1", "true", "yes", "on"}


def google_mock_enabled() -> bool:
    return _truthy("GOOGLE_OAUTH_MOCK")


def google_config_ready() -> bool:
    return bool(os.getenv("GOOGLE_OAUTH_CLIENT_ID")) and bool(
        os.getenv("GOOGLE_OAUTH_CLIENT_SECRET")
    )


def google_login_enabled() -> bool:
    return jwt_auth_enabled() and (google_config_ready() or google_mock_enabled())


def frontend_url() -> str:
    return (os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


def redirect_uri() -> str:
    return os.getenv("GOOGLE_OAUTH_REDIRECT_URI") or f"{frontend_url()}/auth/google/callback"


def allowed_domains() -> list[str]:
    raw = os.getenv("GOOGLE_OAUTH_ALLOWED_DOMAINS") or "kmitl.ac.th"
    return [d.strip().lower() for d in raw.split(",") if d.strip()]


def student_regex() -> re.Pattern[str]:
    raw = os.getenv("KMITL_STUDENT_EMAIL_REGEX") or r"^\d{8}$"
    try:
        return re.compile(raw)
    except re.error:
        logger.warning(f"Invalid KMITL_STUDENT_EMAIL_REGEX={raw!r}; using default")
        return re.compile(r"^\d{8}$")


def admin_emails() -> set[str]:
    raw = os.getenv("WORKSPACE_ADMIN_EMAILS") or ""
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def derive_role(email: str) -> Tuple[str, Optional[str]]:
    """Return ``(role, student_id)`` for an institutional e-mail."""
    email = (email or "").strip().lower()
    local = email.split("@", 1)[0]
    if email in admin_emails():
        return USER_ROLE_ADMIN, None
    if student_regex().match(local):
        return USER_ROLE_STUDENT, local
    return USER_ROLE_TEACHER, None


def _domain_allowed(email: str, hd: Optional[str]) -> bool:
    domain = (email or "").rsplit("@", 1)[-1].lower()
    allowed = allowed_domains()
    if domain in allowed:
        return True
    return bool(hd) and hd.lower() in allowed


# ---------------------------------------------------------------------------
# Signed state (stateless CSRF protection)
# ---------------------------------------------------------------------------


def _sign_state(next_path: str) -> str:
    secret = get_jwt_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="JWT auth is not configured")
    now = int(time.time())
    payload = {
        "purpose": "google_oauth",
        "next": next_path,
        "nonce": secrets.token_urlsafe(12),
        "iat": now,
        "exp": now + STATE_TTL_SECONDS,
    }
    return jwt.encode(payload, secret, algorithm=JWT_ALGORITHM)


def _verify_state(state: str) -> str:
    secret = get_jwt_secret()
    if not secret:
        raise HTTPException(status_code=503, detail="JWT auth is not configured")
    try:
        payload = jwt.decode(state, secret, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid or expired OAuth state: {exc}")
    if payload.get("purpose") != "google_oauth":
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    next_path = str(payload.get("next") or "/community")
    if not next_path.startswith("/") or next_path.startswith("//"):
        next_path = "/community"
    return next_path


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class GoogleStartResponse(BaseModel):
    url: str
    state: str
    mock: bool = False
    redirect_uri: str
    allowed_domains: list[str]


class GoogleExchangeRequest(BaseModel):
    state: str = Field(..., min_length=10)
    code: Optional[str] = None
    # Mock mode only (GOOGLE_OAUTH_MOCK=1)
    mock_email: Optional[str] = Field(default=None, max_length=191)
    mock_name: Optional[str] = Field(default=None, max_length=128)


class GoogleProfile(BaseModel):
    sub: str
    email: str
    email_verified: bool = True
    name: Optional[str] = None
    picture: Optional[str] = None
    hd: Optional[str] = None


class GoogleTokenResponse(TokenResponse):
    next: str = "/community"
    is_new_user: bool = False
    welcome_granted: bool = False


# ---------------------------------------------------------------------------
# Account provisioning
# ---------------------------------------------------------------------------


def _sanitize_username(local: str) -> str:
    cleaned = "".join(ch for ch in local.lower() if ch.isalnum() or ch in "._-")
    cleaned = cleaned.strip("._-") or "user"
    if len(cleaned) < 3:
        cleaned = (cleaned + "-kmitl")[:32]
    return cleaned[:32]


async def _unique_username(base: str) -> str:
    candidate = base
    for attempt in range(2, 40):
        if await username_available(candidate):
            return candidate
        suffix = f"-{attempt}"
        candidate = (base[: 32 - len(suffix)] + suffix)
    return f"{base[:20]}-{secrets.token_hex(3)}"


async def _upsert_google_user(profile: GoogleProfile) -> Tuple[User, bool]:
    email = profile.email.strip().lower()
    role, student_id = derive_role(email)

    user = await get_by_google_sub(profile.sub) if profile.sub else None
    if user is None:
        user = await get_by_email(email)

    if user is None:
        username = await _unique_username(_sanitize_username(email.split("@", 1)[0]))
        try:
            user = await create_sso_user(
                username=username,
                email=email,
                google_sub=profile.sub,
                display_name=(profile.name or email.split("@", 1)[0])[:128],
                avatar_url=profile.picture,
                role=role,
                student_id=student_id,
            )
        except UserAlreadyExists:
            user = await get_by_email(email)
            if user is None:
                raise
        else:
            return user, True

    # Existing account: link Google identity + refresh profile. Never
    # downgrade an admin; otherwise adopt the institutional role.
    new_role = None
    if user.role != USER_ROLE_ADMIN and role != user.role:
        new_role = role
    updated = await update_profile(
        user.id or 0,
        email=email if user.email != email else None,
        google_sub=profile.sub if user.google_sub != profile.sub else None,
        display_name=(profile.name[:128] if profile.name and not user.display_name else None),
        avatar_url=profile.picture if profile.picture and profile.picture != user.avatar_url else None,
        role=new_role,
        student_id=student_id if student_id and student_id != user.student_id else None,
    )
    return (updated or user), False


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/start", response_model=GoogleStartResponse)
async def google_start(next: str = "/community") -> GoogleStartResponse:
    if not google_login_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google login is not configured (set GOOGLE_OAUTH_CLIENT_ID/SECRET or GOOGLE_OAUTH_MOCK=1)",
        )
    state = _sign_state(next)

    if not google_config_ready() and google_mock_enabled():
        return GoogleStartResponse(
            url=f"/auth/google/mock?state={state}",
            state=state,
            mock=True,
            redirect_uri=redirect_uri(),
            allowed_domains=allowed_domains(),
        )

    params = {
        "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
        "include_granted_scopes": "true",
    }
    domains = allowed_domains()
    if len(domains) == 1:
        params["hd"] = domains[0]  # pre-filter the Google account chooser
    return GoogleStartResponse(
        url=f"{GOOGLE_AUTH_URL}?{urlencode(params)}",
        state=state,
        mock=False,
        redirect_uri=redirect_uri(),
        allowed_domains=domains,
    )


async def _fetch_google_profile(code: str) -> GoogleProfile:
    data = {
        "code": code,
        "client_id": os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
        "client_secret": os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        token_resp = await client.post(GOOGLE_TOKEN_URL, data=data)
        if token_resp.status_code != 200:
            logger.warning(f"Google token exchange failed: {token_resp.status_code} {token_resp.text[:200]}")
            raise HTTPException(status_code=400, detail="Google token exchange failed")
        access_token = token_resp.json().get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="Google did not return an access token")
        info_resp = await client.get(
            GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
        )
        if info_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Could not read Google profile")
        info = info_resp.json()
    try:
        return GoogleProfile(
            sub=str(info.get("sub") or ""),
            email=str(info.get("email") or ""),
            email_verified=bool(info.get("email_verified", True)),
            name=info.get("name"),
            picture=info.get("picture"),
            hd=info.get("hd"),
        )
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=400, detail=f"Invalid Google profile: {exc}")


@router.post("/exchange", response_model=GoogleTokenResponse)
async def google_exchange(payload: GoogleExchangeRequest) -> GoogleTokenResponse:
    if not google_login_enabled():
        raise HTTPException(status_code=503, detail="Google login is not configured")
    next_path = _verify_state(payload.state)

    if payload.code and google_config_ready():
        profile = await _fetch_google_profile(payload.code)
    elif payload.mock_email and google_mock_enabled():
        email = payload.mock_email.strip().lower()
        if "@" not in email:
            raise HTTPException(status_code=400, detail="Enter a full e-mail address")
        profile = GoogleProfile(
            sub=f"mock:{email}",
            email=email,
            email_verified=True,
            name=(payload.mock_name or email.split("@", 1)[0]).strip() or None,
            picture=None,
            hd=email.rsplit("@", 1)[-1],
        )
        logger.warning(f"GOOGLE_OAUTH_MOCK login for {email} (dev only)")
    else:
        raise HTTPException(status_code=400, detail="Missing authorization code")

    if not profile.email or not profile.email_verified:
        raise HTTPException(status_code=403, detail="Google account e-mail is not verified")
    if not _domain_allowed(profile.email, profile.hd):
        domains = ", ".join(f"@{d}" for d in allowed_domains())
        raise HTTPException(
            status_code=403,
            detail=f"Please sign in with your institutional account ({domains})",
        )

    user, is_new = await _upsert_google_user(profile)
    welcome = await points.ensure_welcome(user)
    await touch_last_login(user.id or "")
    fresh = await get_by_id(user.id or 0) or user

    access_token, expires_at = issue_access_token(fresh)
    return GoogleTokenResponse(
        access_token=access_token,
        expires_at=expires_at,
        user=_to_response(fresh),
        next=next_path,
        is_new_user=is_new,
        welcome_granted=welcome,
    )
