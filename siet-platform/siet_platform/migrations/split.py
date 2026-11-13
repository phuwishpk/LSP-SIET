"""
One-time move of the KMITL migration records out of open-notebook's table.

    python -m siet_platform.migrations.split --dry-run
    python -m siet_platform.migrations.split --backup-done

Before the split the KMITL schema changes ran as core migrations 19-25, so
``_sbl_migrations`` says 25 although upstream open-notebook (at our base) has
18. This script, in one transaction, deletes those seven records and writes the
matching k2..k8 into ``_siet_migrations``. k1 (a function definition that is
safe to repeat) is left to run again on the next start. Nothing else in the
database changes. Back up surreal_data first: ``make migrate-split`` does.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from typing import List, Tuple

from open_notebook.database.repository import repo_query
from siet_platform.migrations import (
    KMITL_MARKER_TABLE,
    LEGACY_CORE_VERSIONS,
    TABLE,
    _tables,
    applied,
)


async def plan() -> Tuple[str, List[int], List[int]]:
    """``(message, core versions to delete, k-migrations to record)``."""
    if await applied():
        return "already split: nothing to do", [], []
    if KMITL_MARKER_TABLE not in await _tables():
        return "no KMITL tables yet (fresh database): nothing to do", [], []
    rows = await repo_query("SELECT version FROM _sbl_migrations;")
    versions = sorted(int(r["version"]) for r in rows or [])
    legacy = [v for v in versions if v in LEGACY_CORE_VERSIONS]
    unknown = [v for v in versions if v > max(LEGACY_CORE_VERSIONS)]
    if unknown:
        raise SystemExit(f"_sbl_migrations has versions this script does not know: {unknown}")
    if not legacy:
        raise SystemExit(
            f"{KMITL_MARKER_TABLE} exists but _sbl_migrations has none of 19-25; "
            "check the database by hand"
        )
    ks = [LEGACY_CORE_VERSIONS[v] for v in legacy]
    return f"move core {legacy} -> k{ks}; core version becomes {min(legacy) - 1}", legacy, ks


async def split(dry_run: bool) -> str:
    message, legacy, ks = await plan()
    if dry_run or not legacy:
        return message
    statements = ["BEGIN TRANSACTION;"]
    statements += [f"DELETE type::thing('_sbl_migrations', {v});" for v in legacy]
    statements += [
        f"CREATE type::thing('{TABLE}', {k}) SET version = {k}, applied_at = time::now();"
        for k in ks
    ]
    statements.append("COMMIT TRANSACTION;")
    await repo_query("\n".join(statements))
    return "done: " + message


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="show what would change")
    group.add_argument(
        "--backup-done",
        action="store_true",
        help="confirm surreal_data was backed up, then apply",
    )
    args = parser.parse_args()
    print(asyncio.run(split(dry_run=args.dry_run)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
