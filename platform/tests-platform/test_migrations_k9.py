"""k9 drops the podcast tables again.

Core migrations 20-22 recreate ``episode`` / ``episode_profile`` / ``speaker_profile``
on a database upgraded from an older release, so the k7 drop is not enough.
"""

from siet_platform.migrations import MIGRATION_IDS, migration_path

PODCAST_TABLES = ("episode", "episode_profile", "podcast_config", "speaker_profile")


def test_k9_registered():
    assert 9 in MIGRATION_IDS
    sql = migration_path(9).read_text()
    for table in PODCAST_TABLES:
        assert f"REMOVE TABLE IF EXISTS {table};" in sql


def test_k9_down_is_a_no_op():
    down = migration_path(9, down=True).read_text()
    statements = [
        line for line in down.splitlines() if line.strip() and not line.lstrip().startswith("--")
    ]
    assert statements in ([], ["RETURN NONE;"])
