"""Shared FastAPI dependencies for owner resolution."""

from typing import Optional

from fastapi import Depends, Header, HTTPException, Request


# ---------------------------------------------------------------------------
# Owner resolution
# ---------------------------------------------------------------------------

DEFAULT_OWNER_ID = "default"


def _resolve_owner_id(
    request: Request,
    x_owner_id: Optional[str] = Header(default=None, alias="X-Owner-Id"),
) -> str:
    """
    Read the per-user identifier from the request.

    Priority:
      1. ``X-Owner-Id`` header supplied by the caller
      2. ``request.state.owner_id`` populated by the auth middleware
      3. ``"default"`` so legacy single-user setups keep working
    """
    if x_owner_id:
        return x_owner_id
    owner_id = getattr(request.state, "owner_id", None)
    if owner_id:
        return owner_id
    return DEFAULT_OWNER_ID


async def get_owner_id(request: Request) -> str:
    """
    Dependency that returns the authenticated owner's ID, raising 401 if absent.

    Use this in routes that require authentication.
    """
    owner_id = getattr(request.state, "owner_id", None)
    if not owner_id:
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
        )
    return owner_id


def owner_can_access(entity, owner_id: str) -> bool:
    """
    True when ``owner_id`` may act on ``entity``.

    Matches the list-query semantics used across routers: an entity with no
    ``owner_id`` (or the legacy ``"default"`` marker from pre-auth records) is
    visible to every authenticated user; otherwise it must match exactly.
    """
    entity_owner = getattr(entity, "owner_id", None)
    if entity_owner is None or entity_owner == DEFAULT_OWNER_ID:
        return True
    return entity_owner == owner_id
