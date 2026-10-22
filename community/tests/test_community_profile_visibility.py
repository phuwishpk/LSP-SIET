from contextlib import asynccontextmanager

import pytest

from siet_community import repository


class _Result:
    def all(self):
        return []


class _Session:
    def __init__(self):
        self.statement = None
        self.params = None

    async def execute(self, statement, params):
        self.statement = str(statement)
        self.params = params
        return _Result()


@pytest.mark.asyncio
async def test_other_user_profile_feed_limits_course_posts_to_shared_courses(monkeypatch):
    session = _Session()

    @asynccontextmanager
    async def fake_session():
        yield session

    monkeypatch.setattr(repository, "_mariadb_session", fake_session)

    await repository.list_posts(
        viewer_id=7,
        author_id=12,
        profile_visibility_only=True,
    )

    assert "p.author_id = :author_id" in session.statement
    assert "p.room_id IS NULL" in session.statement
    assert "viewer_members.user_id = :viewer" in session.statement
    assert "author_members.user_id = :author_id" in session.statement
    assert session.params["viewer"] == 7
    assert session.params["author_id"] == 12


@pytest.mark.asyncio
async def test_own_profile_feed_includes_posts_from_all_courses(monkeypatch):
    session = _Session()

    @asynccontextmanager
    async def fake_session():
        yield session

    monkeypatch.setattr(repository, "_mariadb_session", fake_session)

    await repository.list_posts(
        viewer_id=7,
        author_id=7,
        profile_visibility_only=True,
    )

    assert "p.author_id = :author_id" in session.statement
    assert "p.room_id IS NULL" not in session.statement
    assert session.params["author_id"] == 7
