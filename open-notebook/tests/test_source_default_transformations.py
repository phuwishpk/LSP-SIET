"""A source created without a `transformations` list gets the default summaries.

The add-source dialog used to send the list of transformations marked
`apply_default`. The dialog no longer has a picker, so the backend does it:
a request that leaves `transformations` out applies every transformation with
`apply_default = true`; an explicit list (also an empty one) is used as sent.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api.models import SourceCreate
from api.routers.sources import resolve_transformations
from open_notebook.domain.transformation import Transformation


def _transformation(id_: str, apply_default: bool) -> Transformation:
    return Transformation(
        id=id_,
        name=id_.split(":")[1],
        title=id_.split(":")[1].title(),
        description="",
        prompt="Summarize this",
        apply_default=apply_default,
        created=datetime(2026, 1, 1, 12, 0, 0),
        updated=datetime(2026, 1, 1, 12, 0, 0),
    )


A = _transformation("transformation:a", apply_default=True)
B = _transformation("transformation:b", apply_default=False)
C = _transformation("transformation:c", apply_default=True)
RECORDS = {t.id: t for t in (A, B, C)}


@pytest.fixture
def records():
    """Mock the transformation table: get_all lists it, get reads one record."""

    async def get(id_):
        return RECORDS.get(id_)

    with (
        patch.object(
            Transformation, "get_all", new=AsyncMock(return_value=[A, B, C])
        ) as get_all,
        patch.object(Transformation, "get", new=AsyncMock(side_effect=get)) as get_one,
    ):
        yield get_all, get_one


class TestResolveTransformations:
    @pytest.mark.asyncio
    async def test_missing_transformations_applies_defaults(self, records):
        assert await resolve_transformations(None) == [A, C]

    @pytest.mark.asyncio
    async def test_empty_list_applies_none(self, records):
        get_all, get_one = records
        assert await resolve_transformations([]) == []
        get_all.assert_not_awaited()
        get_one.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_explicit_ids_kept(self, records):
        get_all, _ = records
        assert await resolve_transformations(["transformation:b"]) == [B]
        get_all.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_explicit_ids_keep_their_order(self, records):
        assert await resolve_transformations(
            ["transformation:c", "transformation:a"]
        ) == [C, A]

    @pytest.mark.asyncio
    async def test_unknown_explicit_id_is_404(self, records):
        with pytest.raises(HTTPException) as exc:
            await resolve_transformations(["transformation:a", "transformation:gone"])
        assert exc.value.status_code == 404
        assert exc.value.detail == "Transformation transformation:gone not found"

    @pytest.mark.asyncio
    async def test_no_default_records_applies_none(self):
        with patch.object(
            Transformation, "get_all", new=AsyncMock(return_value=[B])
        ):
            assert await resolve_transformations(None) == []


class TestSourceCreateModel:
    """"Field absent" and "explicit []" must stay distinguishable."""

    def test_missing_is_none(self):
        assert SourceCreate(type="text", content="hi").transformations is None

    def test_explicit_null_is_none(self):
        assert (
            SourceCreate(type="text", content="hi", transformations=None).transformations
            is None
        )

    def test_explicit_empty_list_is_kept(self):
        assert (
            SourceCreate(type="text", content="hi", transformations=[]).transformations
            == []
        )


@pytest.fixture
def client():
    from api.dependencies import get_owner_id
    from api.main import app

    app.dependency_overrides[get_owner_id] = lambda: "user:test"
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_owner_id, None)


@pytest.fixture
def queued(records):
    """Capture the transformation ids create_source hands to the sync path."""
    with patch(
        "api.routers.sources._create_source_sync_path",
        new=AsyncMock(side_effect=HTTPException(status_code=418, detail="stop here")),
    ) as sync_path:
        yield sync_path


def _ids_handed_to_sync_path(sync_path) -> list[str]:
    # _create_source_sync_path(source_data, content_state, transformation_ids, ...)
    return sync_path.await_args.args[2]


class TestCreateSourceAppliesDefaults:
    def test_form_without_field_applies_defaults(self, client, queued):
        response = client.post("/api/sources", data={"type": "text", "content": "hi"})
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == [A.id, C.id]

    def test_form_with_empty_list_applies_none(self, client, queued):
        response = client.post(
            "/api/sources",
            data={"type": "text", "content": "hi", "transformations": "[]"},
        )
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == []

    def test_form_with_explicit_ids_keeps_them(self, client, queued):
        response = client.post(
            "/api/sources",
            data={
                "type": "text",
                "content": "hi",
                "transformations": '["transformation:b"]',
            },
        )
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == [B.id]

    def test_json_without_key_applies_defaults(self, client, queued):
        response = client.post(
            "/api/sources/json", json={"type": "text", "content": "hi"}
        )
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == [A.id, C.id]

    def test_json_with_empty_list_applies_none(self, client, queued):
        response = client.post(
            "/api/sources/json",
            json={"type": "text", "content": "hi", "transformations": []},
        )
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == []

    def test_json_with_explicit_ids_keeps_them(self, client, queued):
        response = client.post(
            "/api/sources/json",
            json={
                "type": "text",
                "content": "hi",
                "transformations": ["transformation:b"],
            },
        )
        assert response.status_code == 418
        assert _ids_handed_to_sync_path(queued) == [B.id]

    def test_unknown_explicit_id_is_404_and_nothing_is_queued(self, client, queued):
        response = client.post(
            "/api/sources/json",
            json={
                "type": "text",
                "content": "hi",
                "transformations": ["transformation:gone"],
            },
        )
        assert response.status_code == 404
        queued.assert_not_awaited()
