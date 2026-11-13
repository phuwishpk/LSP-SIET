"""The k-track runner and the one-time split, against a fake SurrealDB."""

import pytest

from siet_platform import migrations
from siet_platform.migrations import split


class FakeDB:
    def __init__(self, core_versions, tables, siet_versions=()):
        self.core = list(core_versions)
        self.tables = set(tables)
        self.siet = list(siet_versions)
        self.queries = []

    async def query(self, sql, params=None):
        self.queries.append(sql)
        if sql.startswith("SELECT version FROM _siet_migrations"):
            return [{"version": v} for v in self.siet]
        if sql.startswith("SELECT version FROM _sbl_migrations"):
            return [{"version": v} for v in self.core]
        if sql.startswith("INFO FOR DB"):
            return [{"tables": {t: "" for t in self.tables}}]
        return []


@pytest.fixture
def db(monkeypatch):
    def install(fake):
        monkeypatch.setattr(migrations, "repo_query", fake.query)
        monkeypatch.setattr(split, "repo_query", fake.query)
        return fake

    return install


@pytest.mark.asyncio
async def test_legacy_database_must_be_split_first(db):
    db(FakeDB(range(1, 26), {"notebook", "quiz_session"}))
    assert await migrations.needs_split() is True
    with pytest.raises(migrations.MigrationSplitRequired):
        await migrations.run_pending()


@pytest.mark.asyncio
async def test_split_moves_19_to_25_in_one_transaction_and_leaves_k1(db):
    fake = db(FakeDB(range(1, 26), {"notebook", "quiz_session"}))
    message = await split.split(dry_run=False)
    assert "core version becomes 18" in message
    sql = fake.queries[-1]
    assert sql.startswith("BEGIN TRANSACTION;") and sql.endswith("COMMIT TRANSACTION;")
    assert all(f"type::thing('_sbl_migrations', {v})" in sql for v in range(19, 26))
    assert all(f"type::thing('_siet_migrations', {k})" in sql for k in range(2, 9))
    assert "type::thing('_siet_migrations', 1)" not in sql  # k1 re-runs: it is idempotent


@pytest.mark.asyncio
async def test_dry_run_writes_nothing(db):
    fake = db(FakeDB(range(1, 24), {"quiz_session"}))
    message = await split.split(dry_run=True)
    assert "k[2, 3, 4, 5, 6]" in message and "becomes 18" in message
    assert not any("BEGIN" in q for q in fake.queries)


@pytest.mark.asyncio
async def test_nothing_to_split_on_fresh_or_already_split_databases(db):
    db(FakeDB(range(1, 19), {"notebook"}))
    assert "fresh database" in await split.split(dry_run=False)
    assert await migrations.needs_split() is False
    db(FakeDB(range(1, 19), {"quiz_session"}, siet_versions=range(1, 9)))
    assert "already split" in await split.split(dry_run=False)


@pytest.mark.asyncio
async def test_unknown_core_versions_stop_the_split(db):
    db(FakeDB(range(1, 27), {"quiz_session"}))
    with pytest.raises(SystemExit):
        await split.split(dry_run=True)


def test_every_k_migration_has_up_and_down_files():
    for number in migrations.MIGRATION_IDS:
        assert migrations.migration_path(number).exists()
        assert migrations.migration_path(number, down=True).exists()
