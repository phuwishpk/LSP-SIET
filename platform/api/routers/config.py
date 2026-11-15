import asyncio
import tomllib
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request
from loguru import logger

from siet_core.database.repository import repo_query

router = APIRouter()


def get_version() -> str:
    """Read version from pyproject.toml"""
    try:
        pyproject_path = Path(__file__).parent.parent.parent / "pyproject.toml"
        with open(pyproject_path, "rb") as f:
            pyproject = tomllib.load(f)
            return pyproject.get("project", {}).get("version", "unknown")
    except Exception as e:
        logger.warning(f"Could not read version from pyproject.toml: {e}")
        return "unknown"


async def get_latest_version_cached(current_version: str) -> tuple[Optional[str], bool]:
    """
    The "newer release available" check, switched off.

    LSP-SIET is deployed from its own images, so there is no release feed to ask
    and the server makes no outgoing request here. The answer is always "no
    information, no update"; ``/api/config`` keeps its ``latestVersion`` and
    ``hasUpdate`` fields so clients that read them keep working.
    """
    return None, False


async def check_database_health() -> dict:
    """
    Check if database is reachable using a lightweight query.

    Returns:
        dict with 'status' ("online" | "offline") and optional 'error'
    """
    try:
        # 2-second timeout for database health check
        result = await asyncio.wait_for(repo_query("RETURN 1"), timeout=2.0)
        if result:
            return {"status": "online"}
        return {"status": "offline", "error": "Empty result"}
    except asyncio.TimeoutError:
        logger.warning("Database health check timed out after 2 seconds")
        return {"status": "offline", "error": "Health check timeout"}
    except Exception as e:
        logger.warning(f"Database health check failed: {e}")
        return {"status": "offline", "error": str(e)}


@router.get("/config")
async def get_config(request: Request):
    """
    Get frontend configuration.

    Returns version information and health status.
    Note: The frontend determines the API URL via its own runtime-config endpoint,
    so this endpoint no longer returns apiUrl. ``latestVersion`` is always null
    and ``hasUpdate`` always false (see get_latest_version_cached).
    """
    # Get current version
    current_version = get_version()

    latest_version, has_update = await get_latest_version_cached(current_version)

    # Check database health
    db_health = await check_database_health()
    db_status = db_health["status"]

    if db_status == "offline":
        logger.warning(f"Database offline: {db_health.get('error', 'Unknown error')}")

    return {
        "version": current_version,
        "latestVersion": latest_version,
        "hasUpdate": has_update,
        "dbStatus": db_status,
    }
