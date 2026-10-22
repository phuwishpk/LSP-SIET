"""
Teaching media + library hardening (4.3.2): media file types that are stored
but not embedded, magic-byte checks, per-type size limits, the download route,
the stuck-document reaper, retry cleanup, shared-file safety and room-manager
rights over course documents.
"""

import os
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

from siet_platform import library
from siet_platform.users import User


def _user(uid: int, role: str) -> User:
    return User(id=uid, username=f"user{uid}", role=role, display_name=f"User {uid}")


def _doc(**over):
    base = {"id": 3, "owner_id": 7, "scope": "course", "course_id": 5, "notebook_id": "notebook:x",
            "source_id": None, "title": "slides", "kind": "file", "filename": "slides.pdf",
            "file_path": "/tmp/none", "mime": "application/pdf", "size": 10, "status": "ready",
            "error": None, "chunks": 4, "chars": 100, "post_id": None}
    base.update(over)
    return base


# ---------------------------------------------------------------------------
# extensions, limits, signatures
# ---------------------------------------------------------------------------


def test_media_extensions_are_allowed_but_flagged():
    assert library.validate_extension("clip.mp4") == ".mp4"
    assert library.is_media_ext(".mp4") and library.is_media_ext(".PNG") and library.is_media_ext(".zip")
    assert not library.is_media_ext(".pdf")
    with pytest.raises(library.LibraryError):
        library.validate_extension("tool.exe")


def test_media_gets_the_larger_limit(monkeypatch):
    monkeypatch.setattr(library, "MAX_UPLOAD_MB", 100)
    monkeypatch.setattr(library, "MAX_MEDIA_UPLOAD_MB", 200)
    assert library.upload_limit_bytes(".pdf") == 100 * 1024 * 1024
    assert library.upload_limit_bytes(".webm") == 200 * 1024 * 1024


def test_signature_check_matches_bytes_to_extension(tmp_path):
    pdf = tmp_path / "a.pdf"; pdf.write_bytes(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj")
    png = tmp_path / "b.png"; png.write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
    fake = tmp_path / "c.pdf"; fake.write_bytes(b"MZ\x90\x00" + b"\x00" * 64)        # an .exe named .pdf
    zipped = tmp_path / "d.docx"; zipped.write_bytes(b"PK\x03\x04" + b"\x00" * 64)
    txt = tmp_path / "e.txt"; txt.write_text("สวัสดี hello", encoding="utf-8")
    binary_txt = tmp_path / "f.md"; binary_txt.write_bytes(b"abc\x00def")

    assert library.check_signature(str(pdf), ".pdf") == "application/pdf"
    assert library.check_signature(str(png), ".png") == "image/png"
    assert library.check_signature(str(zipped), ".docx") == "application/zip"
    assert library.check_signature(str(txt), ".txt") is None
    with pytest.raises(library.LibraryError):
        library.check_signature(str(fake), ".pdf")
    with pytest.raises(library.LibraryError):
        library.check_signature(str(binary_txt), ".md")


@pytest.mark.asyncio
async def test_save_upload_streams_and_enforces_the_limit(tmp_path):
    class _Upload:
        def __init__(self, data, step=4):
            self.data, self.step, self.pos = data, step, 0

        async def read(self, n):
            chunk = self.data[self.pos:self.pos + self.step]
            self.pos += self.step
            return chunk

    target = tmp_path / "ok.bin"
    size, digest = await library.save_upload(_Upload(b"0123456789"), str(target), limit=100)
    assert size == 10 and target.read_bytes() == b"0123456789" and len(digest) == 32

    too_big = tmp_path / "big.bin"
    with pytest.raises(library.LibraryError):
        await library.save_upload(_Upload(b"x" * 50), str(too_big), limit=20)
    assert not too_big.exists()


# ---------------------------------------------------------------------------
# ingest / retry / reaper / delete
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_media_is_stored_not_embedded(monkeypatch):
    monkeypatch.setattr(library, "get_document", AsyncMock(return_value=_doc(filename="clip.mp4")))
    update = AsyncMock()
    monkeypatch.setattr(library, "update_document", update)
    monkeypatch.setattr(library, "_extract_text", AsyncMock(side_effect=AssertionError("must not extract")))
    await library.ingest_document(3)
    update.assert_awaited_once_with(3, status="ready", chunks=0, chars=0, error=None)


@pytest.mark.asyncio
async def test_retry_discards_the_previous_source_first(monkeypatch):
    monkeypatch.setattr(library, "get_document", AsyncMock(return_value=_doc(source_id="source:old")))
    discard = AsyncMock()
    monkeypatch.setattr(library, "_discard_source", discard)
    update = AsyncMock()
    monkeypatch.setattr(library, "update_document", update)
    monkeypatch.setattr(library, "_extract_text", AsyncMock(side_effect=library.LibraryError("boom")))
    await library.ingest_document(3)
    discard.assert_awaited_once_with("source:old")
    assert update.await_args_list[0].kwargs == {"source_id": None, "chunks": 0}
    assert update.await_args_list[-1].kwargs["status"] == "failed"


class _Result:
    def __init__(self, rows=None, rowcount=0):
        self._rows, self.rowcount = rows or [], rowcount

    def first(self):
        return self._rows[0] if self._rows else None

    def all(self):
        return self._rows


class _Session:
    def __init__(self, results=None):
        self.statements, self.params, self._results = [], [], list(results or [])

    async def execute(self, statement, params=None):
        self.statements.append(" ".join(str(statement).split()))
        self.params.append(params or {})
        return self._results.pop(0) if self._results else _Result()


def _patch_session(monkeypatch, fake):
    @asynccontextmanager
    async def fake_session():
        yield fake

    monkeypatch.setattr(library, "_mariadb_session", fake_session)


@pytest.mark.asyncio
async def test_reaper_marks_old_processing_rows_failed(monkeypatch):
    fake = _Session([_Result(rowcount=2)])
    _patch_session(monkeypatch, fake)
    assert await library.reap_stuck_documents(45) == 2
    sql = fake.statements[-1]
    assert "SET status = 'failed'" in sql and "WHERE status = 'processing'" in sql
    assert "INTERVAL :minutes MINUTE" in sql and fake.params[-1]["minutes"] == 45


@pytest.mark.asyncio
async def test_delete_keeps_a_file_a_post_still_uses(monkeypatch, tmp_path):
    shared = tmp_path / "shared.pdf"; shared.write_bytes(b"%PDF-1.4")
    fake = _Session([_Result(rows=[(1,)]), _Result(), _Result()])   # posts row found -> keep
    _patch_session(monkeypatch, fake)
    monkeypatch.setattr(library, "_discard_source", AsyncMock())
    await library.delete_document(_doc(file_path=str(shared), source_id="source:x"))
    assert shared.exists()
    assert fake.statements[-1].startswith("DELETE FROM library_documents")

    lonely = tmp_path / "lonely.pdf"; lonely.write_bytes(b"%PDF-1.4")
    fake2 = _Session([_Result(), _Result(), _Result()])             # nothing references it
    _patch_session(monkeypatch, fake2)
    await library.delete_document(_doc(id=4, file_path=str(lonely), source_id=None))
    assert not lonely.exists()


# ---------------------------------------------------------------------------
# who may manage a document
# ---------------------------------------------------------------------------


def test_room_managers_manage_course_documents():
    doc = _doc(owner_id=9)
    assert library.can_manage_document(_user(9, "teacher"), doc)                 # uploader
    assert library.can_manage_document(_user(1, "admin"), doc, None)             # admin (None = all)
    assert library.can_manage_document(_user(7, "teacher"), doc, {5})            # owner/TA of room 5
    assert not library.can_manage_document(_user(7, "teacher"), doc, {6})        # runs another room
    assert not library.can_manage_document(_user(7, "teacher"), doc)             # no room info given
    assert not library.can_manage_document(_user(7, "teacher"), _doc(owner_id=9, scope="personal", course_id=None), {5})


# ---------------------------------------------------------------------------
# download route
# ---------------------------------------------------------------------------


@pytest.fixture
def app():
    from api.main import app as fastapi_app

    return fastapi_app


@pytest.fixture
def client(app, monkeypatch):
    from api.auth import PasswordAuthMiddleware
    from siet_platform.auth_roles import RoleAccessMiddleware

    async def passthrough(self, request, call_next):
        return await call_next(request)

    monkeypatch.setattr(PasswordAuthMiddleware, "dispatch", passthrough)
    monkeypatch.setattr(RoleAccessMiddleware, "dispatch", passthrough)
    return TestClient(app)


@pytest.fixture
def sign_in(app):
    from siet_platform.auth_jwt import get_current_user

    def _as(user: User) -> User:
        app.dependency_overrides[get_current_user] = lambda: user
        return user

    yield _as
    app.dependency_overrides.pop(get_current_user, None)


def test_download_is_inline_for_pdf_attachment_for_zip_and_404_when_unreadable(client, sign_in, monkeypatch, tmp_path):
    pdf = tmp_path / "slides.pdf"; pdf.write_bytes(b"%PDF-1.4 hello")
    zipped = tmp_path / "code.zip"; zipped.write_bytes(b"PK\x03\x04data")
    docs = {
        3: _doc(id=3, file_path=str(pdf)),
        4: _doc(id=4, file_path=str(zipped), filename="code.zip", mime="application/zip"),
        5: _doc(id=5, kind="url", file_path="https://example.org", filename=None),
    }
    monkeypatch.setattr(library, "get_document", AsyncMock(side_effect=lambda i: docs.get(i)))
    monkeypatch.setattr(library, "can_read_document", AsyncMock(return_value=True))
    sign_in(_user(20, "student"))

    res = client.get("/api/community/library/3/download")
    assert res.status_code == 200 and res.content == b"%PDF-1.4 hello"
    assert res.headers["content-disposition"].startswith("inline")
    res = client.get("/api/community/library/4/download")
    assert res.status_code == 200 and res.headers["content-disposition"].startswith("attachment")
    assert client.get("/api/community/library/5/download").status_code == 404        # url document: no file
    assert client.get("/api/community/library/99/download").status_code == 404

    monkeypatch.setattr(library, "can_read_document", AsyncMock(return_value=False))
    assert client.get("/api/community/library/3/download").status_code == 404        # private room, outsider


def test_document_projection_marks_media_and_download(client, sign_in, monkeypatch):
    monkeypatch.setattr(library, "get_document", AsyncMock(return_value=_doc(filename="clip.webm", mime="video/webm")))
    monkeypatch.setattr(library, "can_read_document", AsyncMock(return_value=True))
    monkeypatch.setattr(library, "managed_room_ids", AsyncMock(return_value={5}))
    sign_in(_user(20, "student"))
    body = client.get("/api/community/library/3").json()
    assert body["is_media"] is True
    assert body["download_url"] == "/api/community/library/3/download"
    assert body["can_manage"] is True   # the room set says this user runs room 5


def test_only_file_routes_take_a_query_token():
    from api.auth import accepts_query_token

    assert accepts_query_token("/api/community/library/3/download")
    assert accepts_query_token("/api/community/posts/11/attachment")
    assert not accepts_query_token("/api/community/posts/11")
    assert not accepts_query_token("/api/admin/users")
