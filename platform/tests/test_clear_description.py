"""Clearing a notebook description must persist (#1396).

An explicit "" clears the field; a request without `description` leaves it
untouched.
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from siet_core.domain.notebook import Notebook


@pytest.fixture
def client():
    from api.main import app

    return TestClient(app)


def _notebook():
    return Notebook(id="notebook:n1", name="My notebook", description="old text")


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"description": ""}, ""),
        ({"description": None}, ""),
        ({"description": "new text"}, "new text"),
        ({"name": "Renamed"}, "old text"),
    ],
)
def test_update_notebook_description(client, payload, expected):
    notebook = _notebook()
    with (
        patch(
            "api.routers.notebooks.Notebook.get", new=AsyncMock(return_value=notebook)
        ),
        patch.object(Notebook, "save", new=AsyncMock()) as mock_save,
        patch("api.routers.notebooks.repo_query", new=AsyncMock(return_value=[])),
    ):
        response = client.put("/api/notebooks/notebook:n1", json=payload)

    assert response.status_code == 200
    mock_save.assert_awaited_once()
    assert notebook.description == expected
    assert notebook.model_dump()["description"] == expected
