"""
Point wallet ("Token Economy") for the KMITL AI workspace.

Rates (override any of them with ``POINTS_*`` environment variables):

* ``rag_question``      1 pt  – one KMITL RAG AI question
* ``rag_session``       4 pt  – a 5-message context-aware RAG session
* ``quiz_generate``     8 pt  – generate one AI quiz set
* ``roadmap_generate`` 15 pt  – generate one AI roadmap
* ``quiz_import``       1 pt  – copy a friend's shared quiz into your library

Rewards:

* welcome allowance    +20 pt on first sign-in
* cashback             +1 pt per friend that finishes your shared quiz (max 15 / quiz)
* creator bonus        +2 pt for sharing a lecture summary
* helpful bonus        +1 pt per "Helpful" reaction received

Teachers and admins are exempt: they are never charged.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional

from loguru import logger
from sqlalchemy import text

from open_notebook.domain.user import User, _mariadb_session


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        return max(0, int(raw))
    except ValueError:
        logger.warning(f"Invalid {name}={raw!r}; using default {default}")
        return default


COSTS: Dict[str, int] = {
    "rag_question": _env_int("POINTS_COST_RAG_QUESTION", 1),
    "rag_session": _env_int("POINTS_COST_RAG_SESSION", 4),
    "quiz_generate": _env_int("POINTS_COST_QUIZ_GENERATE", 8),
    "roadmap_generate": _env_int("POINTS_COST_ROADMAP_GENERATE", 15),
    "quiz_import": _env_int("POINTS_COST_QUIZ_IMPORT", 1),
}

WELCOME_POINTS = _env_int("POINTS_WELCOME", 20)
RAG_SESSION_MESSAGES = _env_int("POINTS_RAG_SESSION_MESSAGES", 5)
CASHBACK_PER_PLAY = _env_int("POINTS_CASHBACK_PER_PLAY", 1)
CASHBACK_MAX_PER_POST = _env_int("POINTS_CASHBACK_MAX_PER_POST", 15)
CREATOR_BONUS_SUMMARY = _env_int("POINTS_CREATOR_BONUS_SUMMARY", 2)
HELPFUL_BONUS = _env_int("POINTS_HELPFUL_BONUS", 1)

# Kinds that count towards the weekly "Top Contributors" leaderboard.
CREATOR_KINDS = ("cashback", "creator_bonus", "helpful_bonus")


class InsufficientPoints(Exception):
    def __init__(self, required: int, balance: int, kind: str):
        self.required = required
        self.balance = balance
        self.kind = kind
        super().__init__(
            f"Not enough points: {kind} costs {required} pt but you have {balance} pt"
        )


@dataclass
class Charge:
    user_id: int
    kind: str
    amount: int
    exempt: bool = False
    transaction_id: Optional[int] = None
    balance_after: Optional[int] = None

    @property
    def charged(self) -> bool:
        return not self.exempt and self.amount > 0


def rules_summary() -> Dict[str, Any]:
    """Static description of the economy for the wallet UI."""
    return {
        "costs": dict(COSTS),
        "welcome": WELCOME_POINTS,
        "rag_session_messages": RAG_SESSION_MESSAGES,
        "cashback_per_play": CASHBACK_PER_PLAY,
        "cashback_max_per_post": CASHBACK_MAX_PER_POST,
        "creator_bonus_summary": CREATOR_BONUS_SUMMARY,
        "helpful_bonus": HELPFUL_BONUS,
        "exempt_roles": ["admin", "teacher"],
    }


# ---------------------------------------------------------------------------
# Balance helpers
# ---------------------------------------------------------------------------


async def get_balance(user_id: int) -> int:
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text("SELECT points_balance FROM users WHERE id = :uid"), {"uid": user_id}
            )
        ).first()
    return int(row[0]) if row else 0


async def _insert_transaction(
    session,
    *,
    user_id: int,
    delta: int,
    balance_after: int,
    kind: str,
    ref_type: Optional[str],
    ref_id: Optional[str],
    note: Optional[str],
) -> int:
    result = await session.execute(
        text(
            """
            INSERT INTO point_transactions
                (user_id, delta, balance_after, kind, ref_type, ref_id, note)
            VALUES (:uid, :delta, :bal, :kind, :ref_type, :ref_id, :note)
            """
        ),
        {
            "uid": user_id,
            "delta": delta,
            "bal": balance_after,
            "kind": kind,
            "ref_type": ref_type,
            "ref_id": (ref_id or None) and str(ref_id)[:128],
            "note": (note or None) and str(note)[:255],
        },
    )
    return int(result.lastrowid or 0)


async def charge(
    user: User,
    kind: str,
    *,
    amount: Optional[int] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    note: Optional[str] = None,
) -> Charge:
    """
    Atomically deduct points from ``user``.

    Raises :class:`InsufficientPoints` when the balance is too low. Exempt
    roles (admin/teacher) get a zero-amount ``Charge`` back and nothing is
    written.
    """
    cost = COSTS.get(kind, 0) if amount is None else amount
    if user.id is None:
        raise ValueError("user has no id")
    if user.is_points_exempt or cost <= 0:
        return Charge(user_id=int(user.id), kind=kind, amount=0, exempt=True)

    async with _mariadb_session() as session:
        result = await session.execute(
            text(
                """
                UPDATE users
                   SET points_balance = points_balance - :cost
                 WHERE id = :uid AND points_balance >= :cost
                """
            ),
            {"cost": cost, "uid": user.id},
        )
        if result.rowcount == 0:
            row = (
                await session.execute(
                    text("SELECT points_balance FROM users WHERE id = :uid"),
                    {"uid": user.id},
                )
            ).first()
            balance = int(row[0]) if row else 0
            raise InsufficientPoints(required=cost, balance=balance, kind=kind)

        row = (
            await session.execute(
                text("SELECT points_balance FROM users WHERE id = :uid"), {"uid": user.id}
            )
        ).first()
        balance_after = int(row[0]) if row else 0
        tx_id = await _insert_transaction(
            session,
            user_id=int(user.id),
            delta=-cost,
            balance_after=balance_after,
            kind=kind,
            ref_type=ref_type,
            ref_id=ref_id,
            note=note,
        )

    logger.info(f"points: user {user.id} charged {cost} pt for {kind} (balance {balance_after})")
    return Charge(
        user_id=int(user.id),
        kind=kind,
        amount=cost,
        exempt=False,
        transaction_id=tx_id,
        balance_after=balance_after,
    )


async def grant(
    user_id: int,
    amount: int,
    kind: str,
    *,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    note: Optional[str] = None,
) -> int:
    """Credit ``amount`` points to a user and return the new balance."""
    if amount <= 0:
        return await get_balance(user_id)
    async with _mariadb_session() as session:
        await session.execute(
            text("UPDATE users SET points_balance = points_balance + :amt WHERE id = :uid"),
            {"amt": amount, "uid": user_id},
        )
        row = (
            await session.execute(
                text("SELECT points_balance FROM users WHERE id = :uid"), {"uid": user_id}
            )
        ).first()
        balance_after = int(row[0]) if row else amount
        await _insert_transaction(
            session,
            user_id=user_id,
            delta=amount,
            balance_after=balance_after,
            kind=kind,
            ref_type=ref_type,
            ref_id=ref_id,
            note=note,
        )
    logger.info(f"points: user {user_id} granted {amount} pt for {kind} (balance {balance_after})")
    return balance_after


async def refund(charge_: Optional[Charge], note: Optional[str] = None) -> None:
    """Give back a previous charge (e.g. the LLM call failed)."""
    if charge_ is None or not charge_.charged:
        return
    await grant(
        charge_.user_id,
        charge_.amount,
        "refund",
        ref_type="point_transaction",
        ref_id=str(charge_.transaction_id or ""),
        note=note or f"refund for {charge_.kind}",
    )


async def set_charge_ref(charge_: Optional[Charge], ref_type: str, ref_id: str) -> None:
    """Back-fill the reference of a charge once the generated object has an id."""
    if charge_ is None or not charge_.transaction_id:
        return
    async with _mariadb_session() as session:
        await session.execute(
            text(
                "UPDATE point_transactions SET ref_type = :rt, ref_id = :rid WHERE id = :id"
            ),
            {"rt": ref_type, "rid": str(ref_id)[:128], "id": charge_.transaction_id},
        )


async def ensure_welcome(user: User) -> bool:
    """Grant the one-time welcome allowance. Returns True when it was granted now."""
    if user.id is None or user.is_points_exempt or WELCOME_POINTS <= 0:
        return False
    async with _mariadb_session() as session:
        row = (
            await session.execute(
                text(
                    "SELECT id FROM point_transactions WHERE user_id = :uid AND kind = 'welcome' LIMIT 1"
                ),
                {"uid": user.id},
            )
        ).first()
    if row:
        return False
    await grant(int(user.id), WELCOME_POINTS, "welcome", note="Welcome allowance")
    return True


async def history(user_id: int, limit: int = 50) -> List[Dict[str, Any]]:
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT id, delta, balance_after, kind, ref_type, ref_id, note, created_at
                      FROM point_transactions
                     WHERE user_id = :uid
                     ORDER BY id DESC
                     LIMIT :limit
                    """
                ),
                {"uid": user_id, "limit": int(limit)},
            )
        ).all()
    return [
        {
            "id": r.id,
            "delta": int(r.delta),
            "balance_after": int(r.balance_after),
            "kind": r.kind,
            "ref_type": r.ref_type,
            "ref_id": r.ref_id,
            "note": r.note,
            "created_at": r.created_at.isoformat() if isinstance(r.created_at, datetime) else r.created_at,
        }
        for r in rows
    ]


async def top_creators(days: int = 7, limit: int = 10) -> List[Dict[str, Any]]:
    """Weekly leaderboard: points earned from sharing / helping others."""
    kinds = ",".join(f"'{k}'" for k in CREATOR_KINDS)
    async with _mariadb_session() as session:
        rows = (
            await session.execute(
                text(
                    f"""
                    SELECT u.id, u.username, u.display_name, u.avatar_url, u.role,
                           u.points_balance,
                           COALESCE(SUM(t.delta), 0) AS earned
                      FROM point_transactions t
                      JOIN users u ON u.id = t.user_id
                     WHERE t.delta > 0
                       AND t.kind IN ({kinds})
                       AND t.created_at >= NOW() - INTERVAL :days DAY
                     GROUP BY u.id, u.username, u.display_name, u.avatar_url, u.role, u.points_balance
                     ORDER BY earned DESC, u.id ASC
                     LIMIT :limit
                    """
                ),
                {"days": int(days), "limit": int(limit)},
            )
        ).all()
    return [
        {
            "id": r.id,
            "username": r.username,
            "display_name": r.display_name,
            "avatar_url": r.avatar_url,
            "role": r.role,
            "points_balance": int(r.points_balance or 0),
            "earned": int(r.earned or 0),
        }
        for r in rows
    ]
