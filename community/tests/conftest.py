"""
Run these tests from platform/ with its virtualenv (see `make test-backend`):
the package imports siet_core and api, which live there.
"""

import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import pytest

# Same bootstrap as platform/tests/conftest.py: no password gate, .env loaded,
# platform/ importable.
os.environ["OPEN_NOTEBOOK_PASSWORD"] = ""

from dotenv import load_dotenv

platform_root = Path(__file__).resolve().parents[2] / "platform"
dotenv_path = platform_root / ".env"
if dotenv_path.exists():
    load_dotenv(dotenv_path)

sys.path.insert(0, str(platform_root))


@pytest.fixture(autouse=True)
def _no_real_audit_rows(monkeypatch):
    """
    Route tests reach audit.log_action (room purge, category create, ...). The suite
    is run inside the live API container, so without this every run wrote fake rows
    into the real admin_audit_log. log_action swallows the error; tests that check
    the SQL patch _mariadb_session themselves, which overrides this.
    """
    from siet_platform import audit

    class _NoDatabase:
        async def execute(self, *args, **kwargs):
            raise RuntimeError("tests must not touch the real admin_audit_log")

        async def commit(self):
            pass

    @asynccontextmanager
    async def _session():
        yield _NoDatabase()

    monkeypatch.setattr(audit, "_mariadb_session", _session)
