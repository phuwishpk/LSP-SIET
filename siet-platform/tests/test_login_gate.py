"""
Google login gate (PR #37): an e-mail that qualifies for no role is refused
before any user row is written, but an account whose role an admin already set
keeps working - the role in the database is the source of truth.
"""

from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from siet_platform.routers import google_auth as ga
from siet_platform.routers.google_auth import GoogleExchangeRequest
from siet_platform.users import User


def _user(role: str, **over) -> User:
    base = dict(id=42, username="u42", role=role, email="x@gmail.com", display_name="X")
    base.update(over)
    return User(**base)


@pytest.fixture
def gate(monkeypatch):
    """Mock-mode exchange with every collaborator stubbed; returns the stubs."""
    monkeypatch.setattr(ga, "google_login_enabled", lambda: True)
    monkeypatch.setattr(ga, "google_config_ready", lambda: False)
    monkeypatch.setattr(ga, "google_mock_enabled", lambda: True)
    monkeypatch.setattr(ga, "_verify_state", lambda state: "/community")
    monkeypatch.setattr(ga, "_domain_allowed", AsyncMock(return_value=True))
    stubs = {
        "derive_role": AsyncMock(return_value=(ga.USER_ROLE_PENDING, None)),
        "get_by_google_sub": AsyncMock(return_value=None),
        "get_by_email": AsyncMock(return_value=None),
        "create_sso_user": AsyncMock(),
        "update_profile": AsyncMock(side_effect=lambda uid, **kw: None),
        "touch_last_login": AsyncMock(),
        "get_by_id": AsyncMock(return_value=None),
    }
    for name, stub in stubs.items():
        monkeypatch.setattr(ga, name, stub)
    monkeypatch.setattr(ga.points, "ensure_welcome", AsyncMock(return_value=False))
    monkeypatch.setattr(ga, "issue_access_token", lambda user: ("tok", 0))
    from siet_platform import audit

    stubs["log_action"] = AsyncMock()
    monkeypatch.setattr(audit, "log_action", stubs["log_action"])
    return stubs


def _exchange(email: str = "x@gmail.com"):
    return ga.google_exchange(GoogleExchangeRequest(state="signed-state", mock_email=email, mock_name="X"))


@pytest.mark.asyncio
async def test_unknown_ineligible_email_is_refused_without_a_user_row(gate):
    with pytest.raises(HTTPException) as err:
        await _exchange()
    assert err.value.status_code == 403
    assert err.value.detail.startswith("access_denied_not_eligible:x@gmail.com:")
    gate["create_sso_user"].assert_not_awaited()
    assert gate["log_action"].await_args.kwargs["action"] == "auth.login_failed"


@pytest.mark.parametrize("role", ["student", "teacher", "admin"])
@pytest.mark.asyncio
async def test_account_an_admin_already_approved_passes_the_gate(gate, role):
    """A teacher not on any list, or a non-030 student, that an admin set by hand."""
    approved = _user(role)
    gate["get_by_email"].return_value = approved
    out = await _exchange()
    assert out.access_token == "tok"
    assert out.next in ("/community", "/admin")
    gate["create_sso_user"].assert_not_awaited()
    gate["derive_role"].assert_awaited_once()  # the gate's lookup is reused by the upsert


@pytest.mark.asyncio
async def test_legacy_pending_account_still_ineligible_is_refused(gate):
    gate["get_by_email"].return_value = _user("pending")
    with pytest.raises(HTTPException) as err:
        await _exchange()
    assert err.value.status_code == 403


@pytest.mark.asyncio
async def test_legacy_pending_account_that_now_qualifies_is_upgraded(gate):
    """e.g. a teacher added to allowed_teachers after signing in under the old flow."""
    gate["derive_role"].return_value = (ga.USER_ROLE_TEACHER, None)
    gate["get_by_email"].return_value = _user("pending")
    await _exchange()
    assert gate["update_profile"].await_args.kwargs["role"] == ga.USER_ROLE_TEACHER


@pytest.mark.asyncio
async def test_upsert_never_changes_an_approved_role(gate):
    gate["derive_role"].return_value = (ga.USER_ROLE_STUDENT, "67030001")
    gate["get_by_email"].return_value = _user("teacher")
    await _exchange("67030001@kmitl.ac.th")
    assert gate["update_profile"].await_args.kwargs["role"] is None


@pytest.mark.asyncio
async def test_email_outside_the_allowed_domains_goes_to_denied_too(gate, monkeypatch):
    """A personal Gmail is refused by the domain check: same /denied flow, no user row."""
    monkeypatch.setattr(ga, "_domain_allowed", AsyncMock(return_value=False))
    with pytest.raises(HTTPException) as err:
        await _exchange("someone@gmail.com")
    assert err.value.status_code == 403
    assert err.value.detail.startswith("access_denied_not_eligible:someone@gmail.com:")
    assert gate["log_action"].await_args.kwargs["detail"]["reason"] == "domain_not_allowed"
    gate["create_sso_user"].assert_not_awaited()

