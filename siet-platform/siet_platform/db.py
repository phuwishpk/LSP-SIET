"""
Row helpers shared by the SIET repositories (community, RAG history,
notifications, audit log): MariaDB rows to JSON-ready dicts, UTC bounds and
the small aggregates the admin statistics reuse.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence

from sqlalchemy import bindparam, text


def _iso(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    return value


def _row(r: Any) -> Dict[str, Any]:
    return {k: _iso(v) for k, v in dict(r._mapping).items()}


def _rows(result: Any) -> List[Dict[str, Any]]:
    return [_row(r) for r in result.all()]


def _naive_utc(value: datetime) -> datetime:
    """MariaDB keeps naive UTC DATETIMEs, so that is what a bound must be."""
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


async def _points_spent(session: Any, kinds: Sequence[str], since: datetime) -> int:
    """Points charged for ``kinds`` since ``since``, minus what was refunded."""
    row = (
        await session.execute(
            text(
                """
                SELECT
                  (SELECT COALESCE(SUM(-t.delta), 0) FROM point_transactions t
                    WHERE t.kind IN :kinds AND t.created_at >= :since) AS charged,
                  (SELECT COALESCE(SUM(r.delta), 0) FROM point_transactions r
                     JOIN point_transactions t
                       ON r.ref_type = 'point_transaction' AND r.ref_id = CAST(t.id AS CHAR)
                    WHERE r.kind = 'refund' AND t.kind IN :kinds
                      AND t.created_at >= :since) AS refunded
                """
            ).bindparams(bindparam("kinds", expanding=True)),
            {"kinds": list(kinds), "since": since},
        )
    ).first()
    return int((row.charged or 0) - (row.refunded or 0)) if row else 0


def _author(r: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": r["user_id"],
        "username": r.get("username"),
        "display_name": r.get("display_name"),
        "role": r.get("role"),
    }


def _per_day(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [{"day": str(r["day"]), "count": int(r["count"] or 0)} for r in rows]
