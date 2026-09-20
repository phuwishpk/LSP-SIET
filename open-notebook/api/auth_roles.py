"""
Role-based access control for the KMITL workspace.

Open Notebook was built for a single trusted operator, so every router trusts
whoever passed authentication. In SIET Space the same API is used by hundreds of
students, and without this middleware a student could create notebooks, edit
transformations, read the AI credential list and even change the workspace's
default model for everybody.

The policy is expressed once, here, as path prefixes:

* **student**  – community, knowledge library, quiz/roadmap generation, own profile
* **teacher**  – everything a student can do, plus the Open Notebook research
  surface (notebooks, sources, notes, chat, search, transformations)
* **admin**    – everything, including model configuration and API credentials

Keeping it in middleware rather than per-route means a newly added router is
locked down by default instead of accidentally public.
"""

from __future__ import annotations

from typing import Iterable, Optional

from loguru import logger
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from open_notebook.domain.user import (
    USER_ROLE_ADMIN,
    USER_ROLE_STUDENT,
    USER_ROLE_TEACHER,
)

ROLE_RANK = {USER_ROLE_STUDENT: 1, USER_ROLE_TEACHER: 2, USER_ROLE_ADMIN: 3}

# The Open Notebook research surface: teachers prepare material here.
STAFF_PREFIXES: tuple[str, ...] = (
    "/api/notebooks",
    "/api/sources",
    "/api/notes",
    "/api/insights",
    "/api/context",
    "/api/transformations",
    "/api/chat",
    "/api/search",
    "/api/commands",
    # Mounted at /api (not /api/embeddings), so it needs naming separately:
    # embedding one source costs a provider call and is only reachable from
    # the staff-only source page.
    "/api/embed",
)

# Workspace-wide configuration: one careless change affects every user.
ADMIN_PREFIXES: tuple[str, ...] = (
    "/api/admin",
    "/api/credentials",
    "/api/settings",
    "/api/models",
    "/api/embeddings",
)

DENIED_MESSAGE = {
    USER_ROLE_TEACHER: "ส่วนนี้สำหรับอาจารย์และผู้ดูแลระบบเท่านั้น",
    USER_ROLE_ADMIN: "ส่วนนี้สำหรับผู้ดูแลระบบเท่านั้น",
}


def required_role(path: str) -> Optional[str]:
    """Return the minimum role a path needs, or None when anyone signed in may use it."""
    for prefix in ADMIN_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return USER_ROLE_ADMIN
    for prefix in STAFF_PREFIXES:
        if path == prefix or path.startswith(prefix + "/"):
            return USER_ROLE_TEACHER
    return None


def role_allows(role: Optional[str], needed: str) -> bool:
    return ROLE_RANK.get(role or USER_ROLE_STUDENT, 1) >= ROLE_RANK[needed]


class RoleAccessMiddleware(BaseHTTPMiddleware):
    """Reject requests whose caller does not hold the role the path requires."""

    def __init__(self, app: ASGIApp, exempt_paths: Optional[Iterable[str]] = None) -> None:
        super().__init__(app)
        self.exempt_paths = set(exempt_paths or [])

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        path = request.url.path
        if request.method == "OPTIONS" or path in self.exempt_paths:
            return await call_next(request)

        needed = required_role(path)
        if needed is None:
            return await call_next(request)

        # Anything below this point is a restricted path, so the extra user
        # lookup only happens for the small set of admin/teacher endpoints.
        owner_id = getattr(request.state, "owner_id", None)
        if not owner_id:
            # Auth is disabled entirely (single-user deployment) – keep working.
            return await call_next(request)
        if str(owner_id).startswith("password:"):
            # Legacy shared-password caller: treat as the operator.
            return await call_next(request)

        role = await self._role_for(owner_id)
        if not role_allows(role, needed):
            logger.info(f"RBAC: {role or 'unknown'} blocked from {request.method} {path}")
            return JSONResponse(
                status_code=403,
                content={"detail": DENIED_MESSAGE[needed]},
                headers={"X-Required-Role": needed},
            )
        return await call_next(request)

    async def _role_for(self, owner_id: str) -> Optional[str]:
        from open_notebook.domain.user import get_by_id

        try:
            user = await get_by_id(owner_id)
        except Exception as exc:  # pragma: no cover - defensive
            logger.warning(f"RBAC: could not resolve user {owner_id}: {exc}")
            return None
        return user.role if user else None
