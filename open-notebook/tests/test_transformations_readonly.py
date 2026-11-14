"""Transformations are internal: the API only reads them.

The records drive the automatic document summaries (see
`resolve_transformations` in api/routers/sources.py) and the source page's
"generate insight" menu. Creating, editing, deleting, executing and the
default-prompt editor were removed together with the /transformations page.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from open_notebook.domain.transformation import Transformation


def _client() -> TestClient:
    from api.main import app

    return TestClient(app)


def _transformation() -> Transformation:
    return Transformation(
        id="transformation:123",
        name="summary",
        title="Summary",
        description="Summarize the source",
        prompt="Summarize this",
        apply_default=True,
        model_id="model:stored",
        created=datetime(2026, 1, 1, 12, 0, 0),
        updated=datetime(2026, 1, 1, 12, 0, 0),
    )


def test_router_has_only_the_two_read_routes():
    from api.routers.transformations import router

    served = {(m, route.path) for route in router.routes for m in route.methods}
    assert served == {
        ("GET", "/transformations"),
        ("GET", "/transformations/{transformation_id}"),
    }


def test_removed_write_endpoints_are_not_served():
    client = _client()
    assert client.post("/api/transformations", json={}).status_code == 405
    assert client.post("/api/transformations/execute", json={}).status_code == 405
    assert client.put("/api/transformations/default-prompt", json={}).status_code == 405
    assert client.put("/api/transformations/transformation:1", json={}).status_code == 405
    assert client.delete("/api/transformations/transformation:1").status_code == 405


def test_list_still_works():
    with patch(
        "api.routers.transformations.Transformation.get_all",
        new_callable=AsyncMock,
        return_value=[_transformation()],
    ):
        response = _client().get("/api/transformations")

    assert response.status_code == 200
    body = response.json()
    assert [t["id"] for t in body] == ["transformation:123"]
    assert body[0]["apply_default"] is True
    assert body[0]["model_id"] == "model:stored"


def test_get_one_still_works_and_404s():
    with patch(
        "api.routers.transformations.Transformation.get",
        new_callable=AsyncMock,
        return_value=_transformation(),
    ):
        response = _client().get("/api/transformations/transformation:123")
    assert response.status_code == 200
    assert response.json()["title"] == "Summary"

    with patch(
        "api.routers.transformations.Transformation.get",
        new_callable=AsyncMock,
        return_value=None,
    ):
        response = _client().get("/api/transformations/transformation:gone")
    assert response.status_code == 404
