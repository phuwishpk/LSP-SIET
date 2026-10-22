"""
SurrealDB migrations of the SIET packages, kept apart from open-notebook's.

open-notebook numbers its migrations 1, 2, 3, ... in ``_sbl_migrations``.
The KMITL schema changes used to be core migrations 19-25 (plus an edit to 9),
and upstream has since shipped different migrations under those numbers, so
they now run as k1..k8 and are recorded in ``_siet_migrations``:

    k1  notebook-scoped vector search    (was the KMITL part of core 9)
    k2  quiz / roadmap sessions          (was core 19)
    k3  user accounts (SurrealDB)        (was core 20)
    k4  knowledge_version                (was core 21)
    k5  global chat + owner_id indexes   (was core 22)
    k6  flexible quiz/roadmap objects    (was core 23)
    k7  drop unused tables               (was core 24)
    k8  roadmap settings                 (was core 25)

They run on API startup right after the core migrations. A database migrated
before the split still has 19-25 in ``_sbl_migrations``: the API refuses to
start on it until ``make migrate-split`` (``python -m
siet_platform.migrations.split``) has moved those records over.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, List, Set

from loguru import logger

from open_notebook.database.async_migrate import AsyncMigration
from open_notebook.database.repository import db_connection, repo_query

MIGRATIONS_DIR = Path(__file__).resolve().parent
MIGRATION_IDS = list(range(1, 9))
TABLE = "_siet_migrations"
# Core migrations that open-notebook ran before the split, now k2..k8.
LEGACY_CORE_VERSIONS = {19: 2, 20: 3, 21: 4, 22: 5, 23: 6, 24: 7, 25: 8}
# A table only the KMITL migrations create: it exists on a database that ran
# them, with or without the split.
KMITL_MARKER_TABLE = "quiz_session"


class MigrationSplitRequired(RuntimeError):
    """The database still records the KMITL migrations as core 19-25."""


def migration_path(number: int, down: bool = False) -> Path:
    return MIGRATIONS_DIR / f"k{number}{'_down' if down else ''}.surrealql"


async def applied() -> Set[int]:
    try:
        rows = await repo_query(f"SELECT version FROM {TABLE};")
    except Exception:
        return set()
    return {int(r["version"]) for r in rows or [] if r.get("version") is not None}


async def _tables() -> Set[str]:
    rows: Any = await repo_query("INFO FOR DB;")
    info = rows[0] if isinstance(rows, list) and rows else rows
    return set((info or {}).get("tables", {}) or {})


async def needs_split() -> bool:
    """True for a database migrated before the split (KMITL tables, no k-track yet)."""
    if await applied():
        return False
    return KMITL_MARKER_TABLE in await _tables()


async def run_pending() -> List[int]:
    """Apply the k-migrations this database has not seen yet; returns the ones run."""
    if await needs_split():
        raise MigrationSplitRequired(
            "This database was migrated before the SIET split: KMITL migrations are "
            "still recorded as core migrations 19-25. Back up surreal_data and run "
            "`make migrate-split` (python -m siet_platform.migrations.split), then "
            "start the API again. See docs/UPSTREAM.md, section 5."
        )
    done = await applied()
    ran: List[int] = []
    for number in MIGRATION_IDS:
        if number in done:
            continue
        logger.info(f"Running SIET migration k{number}")
        await _run(AsyncMigration.from_file(str(migration_path(number))), number)
        ran.append(number)
    return ran


async def _run(migration: AsyncMigration, number: int) -> None:
    # AsyncMigration.run() would bump open-notebook's own version table.
    async with db_connection() as connection:
        await connection.query(migration.sql)
    await repo_query(
        f"CREATE type::thing('{TABLE}', $version) SET version = $version, applied_at = time::now();",
        {"version": number},
    )
