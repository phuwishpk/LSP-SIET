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
