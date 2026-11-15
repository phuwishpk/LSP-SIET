"""
Tests that internal exception text is never leaked to API clients in
api/routers/sources.py.

These previously interpolated the raw exception (`detail=f"...: {str(e)}"`)
into the client-facing error response - inconsistent with the safer pattern
already used elsewhere in the same files (e.g. the download handlers),
which log the raw exception server-side but return a fixed generic
message. Every occurrence already had a matching logger.error() call, so
this was a client-facing message change only, not a logging change.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

SECRET = "connection to db-primary-7f3a.internal:5432 refused: password authentication failed"


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


class TestSourcesRouterDoesNotLeakExceptionText:
    def test_list_sources_failure_returns_generic_message(self, client):
        with patch(
            "api.routers.sources.repo_query",
            new=AsyncMock(side_effect=RuntimeError(SECRET)),
        ):
            response = client.get("/api/sources")

        assert response.status_code == 500
        assert SECRET not in response.text
        assert response.json()["detail"] == "Error fetching sources"

    def test_delete_source_failure_returns_generic_message(self, client):
        mock_source = AsyncMock()
        mock_source.delete = AsyncMock(side_effect=RuntimeError(SECRET))

        with patch(
            "api.routers.sources.Source.get", new=AsyncMock(return_value=mock_source)
        ):
            response = client.delete("/api/sources/source:abc123")

        assert response.status_code == 500
        assert SECRET not in response.text
        assert response.json()["detail"] == "Error deleting source"

    def test_get_source_insights_failure_returns_generic_message(self, client):
        mock_source = AsyncMock()
        mock_source.get_insights = AsyncMock(side_effect=RuntimeError(SECRET))

        with patch(
            "api.routers.sources.Source.get", new=AsyncMock(return_value=mock_source)
        ):
            response = client.get("/api/sources/source:abc123/insights")

        assert response.status_code == 500
        assert SECRET not in response.text
        assert response.json()["detail"] == "Error fetching insights"

    def test_update_source_failure_returns_generic_message(self, client):
        mock_source = AsyncMock()
        mock_source.save = AsyncMock(side_effect=RuntimeError(SECRET))
        mock_source.asset = None

        with patch(
            "api.routers.sources.Source.get", new=AsyncMock(return_value=mock_source)
        ):
            response = client.put(
                "/api/sources/source:abc123", json={"title": "New Title"}
            )

        assert response.status_code == 500
        assert SECRET not in response.text
        assert response.json()["detail"] == "Error updating source"


class TestInvalidInputErrorsStillReturnTheirOwnSafeMessage:
    """InvalidInputError is a distinct, deliberate pattern (app-authored,
    user-facing validation text) - not the raw-exception-leak pattern this
    fix targets, and must be untouched."""

    def test_update_source_invalid_input_still_returns_its_message(self, client):
        from siet_core.exceptions import InvalidInputError

        mock_source = AsyncMock()
        mock_source.save = AsyncMock(
            side_effect=InvalidInputError("Title cannot be empty")
        )
        mock_source.asset = None

        with patch(
            "api.routers.sources.Source.get", new=AsyncMock(return_value=mock_source)
        ):
            response = client.put("/api/sources/source:abc123", json={"title": "x"})

        assert response.status_code == 400
        assert response.json()["detail"] == "Title cannot be empty"


class TestTruncateErrorHelper:
    """`_truncate_error` caps client-facing error text surfaced by the source
    status and sync-processing paths (#1136)."""

    def test_none_passes_through(self):
        from api.routers.sources import _truncate_error

        assert _truncate_error(None) is None

    def test_empty_string_passes_through(self):
        from api.routers.sources import _truncate_error

        assert _truncate_error("") == ""

    def test_short_message_unchanged(self):
        from api.routers.sources import _truncate_error

        assert _truncate_error("boom") == "boom"

    def test_message_at_limit_unchanged(self):
        from api.routers.sources import _truncate_error

        msg = "x" * 200
        assert _truncate_error(msg) == msg

    def test_long_message_truncated_with_ellipsis(self):
        from api.routers.sources import _truncate_error

        result = _truncate_error(SECRET + "x" * 500)
        assert result is not None
        # capped at limit + the single-character ellipsis
        assert len(result) == 201
        assert result.endswith("…")
        assert result.startswith(SECRET[:50])

    def test_custom_limit(self):
        from api.routers.sources import _truncate_error

        assert _truncate_error("abcdefghij", limit=4) == "abcd…"
