"""
Audit log retention and filters (PR #37).

90 days is the legal *minimum* (Computer Crime Act B.E. 2560 s.26): the default
purge keeps 90 days, an operator may keep longer or forever, an admin may not
cut below what the operator set, and every purge leaves a trace.
"""

from contextlib import asynccontextmanager
from datetime import datetime
from unittest.mock import AsyncMock

import pytest

from siet_platform import audit


@pytest.mark.parametrize(
    "env, expected",
    [(None, 90), ("", 90), ("30", 90), ("365", 365), ("abc", 90), ("0", None), ("off", None), ("-1", None)],
)
def test_retention_days(monkeypatch, env, expected):
    if env is None:
        monkeypatch.delenv("AUDIT_LOG_RETENTION_DAYS", raising=False)
    else:
        monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", env)
    assert audit.get_retention_days() == expected


def test_admin_cannot_purge_below_the_configured_retention(monkeypatch):
    monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", "365")
    assert audit.effective_retention_days(90) == 365
    assert audit.effective_retention_days(400) == 400
    monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", "off")
    assert audit.effective_retention_days(90) is None


class _Result:
    rowcount = 3


@pytest.fixture
def db(monkeypatch):
    calls = []

    class _Session:
        async def execute(self, statement, params=None):
            calls.append((str(statement), params))
            return _Result()

    @asynccontextmanager
    async def _session():
        yield _Session()

    monkeypatch.setattr(audit, "_mariadb_session", _session)
    logged = AsyncMock()
    monkeypatch.setattr(audit, "log_action", logged)
    return calls, logged


@pytest.mark.asyncio
async def test_purge_deletes_by_retention_and_logs_itself(monkeypatch, db):
    calls, logged = db
    monkeypatch.delenv("AUDIT_LOG_RETENTION_DAYS", raising=False)
    assert await audit.purge_expired_audit_logs(actor_id=5) == 3
    sql, params = calls[0]
    assert sql.startswith("DELETE FROM admin_audit_log") and params == {"days": 90}
    assert logged.await_args.kwargs["action"] == "audit.purge"
    assert logged.await_args.kwargs["actor_id"] == 5


@pytest.mark.asyncio
async def test_keep_forever_deletes_nothing(monkeypatch, db):
    calls, _ = db
    monkeypatch.setenv("AUDIT_LOG_RETENTION_DAYS", "0")
    assert await audit.purge_expired_audit_logs() == 0
    assert calls == []


@pytest.mark.asyncio
async def test_purge_failure_is_not_reported_as_nothing_to_purge(monkeypatch):
    class _Broken:
        async def execute(self, *a, **k):
            raise RuntimeError("db down")

    @asynccontextmanager
    async def _session():
        yield _Broken()

    monkeypatch.setattr(audit, "_mariadb_session", _session)
    monkeypatch.delenv("AUDIT_LOG_RETENTION_DAYS", raising=False)
    with pytest.raises(RuntimeError):
        await audit.purge_expired_audit_logs()


def test_date_bounds_are_converted_to_utc():
    # the admin page sends the viewer's local midnight (Bangkok, UTC+7) as an ISO instant
    assert audit.parse_audit_time("2026-11-11T17:00:00.000Z") == datetime(2026, 11, 11, 17, 0)
    assert audit.parse_audit_time("2026-11-12T00:00:00+07:00") == datetime(2026, 11, 11, 17, 0)
    assert audit.parse_audit_time("2026-11-12", end_of_day=True) == datetime(2026, 11, 12, 23, 59, 59)
    assert audit.parse_audit_time("") is None
    with pytest.raises(ValueError):
        audit.parse_audit_time("12/11/2026")


@pytest.mark.asyncio
async def test_search_matches_action_and_escapes_wildcards(monkeypatch):
    seen = []

    class _Rows:
        def scalar(self):
            return 0

        def all(self):
            return []

    class _Session:
        async def execute(self, statement, params=None):
            seen.append((str(statement), dict(params or {})))
            return _Rows()

    @asynccontextmanager
    async def _session():
        yield _Session()

    monkeypatch.setattr(audit, "_mariadb_session", _session)
    await audit.list_audit(query="user_points", category="course")
    sql, params = seen[0]
    assert "a.action LIKE :query" in sql
    assert params["query"] == "%user\\_points%"
    assert "NOT LIKE 'room.report.%'" in sql
