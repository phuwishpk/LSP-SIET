"""
LSP_SIET_* settings fall back to the old OPEN_NOTEBOOK_* names.

Production .env files and compose environments still use the old names; they
must keep working unchanged until an operator renames them.
"""

import importlib.util
import re
from pathlib import Path

import pytest
from loguru import logger

from siet_core import env as env_module
from siet_core.env import LEGACY_NAMES, env
from siet_core.utils import encryption as enc

NEW = "LSP_SIET_CHUNK_SIZE"
OLD = "OPEN_NOTEBOOK_CHUNK_SIZE"

REPO = Path(__file__).resolve().parents[2]


@pytest.fixture(autouse=True)
def clean_env(monkeypatch):
    """No ambient value of either name, and a fresh once-per-process memory."""
    for name in (NEW, OLD):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(env_module, "_warned", set())


@pytest.fixture
def warnings():
    """The WARNING-level loguru messages emitted while a test runs."""
    messages: list[str] = []
    handler = logger.add(lambda m: messages.append(m.record["message"]), level="WARNING")
    yield messages
    logger.remove(handler)


def test_env_fallback_new_wins(monkeypatch, warnings):
    monkeypatch.setenv(NEW, "new")
    monkeypatch.setenv(OLD, "old")

    assert env(NEW) == "new"
    assert warnings == []


def test_env_fallback_old_used_and_warns(monkeypatch, warnings):
    monkeypatch.setenv(OLD, "old")

    assert env(NEW) == "old"
    assert env(NEW) == "old"

    assert len(warnings) == 1
    assert OLD in warnings[0] and NEW in warnings[0]


def test_env_default(warnings):
    assert env(NEW) is None
    assert env(NEW, "400") == "400"
    assert warnings == []


def test_env_blank_new_name_does_not_shadow_a_real_old_value(monkeypatch):
    # A blank LSP_SIET_PASSWORD= copied from .env.example must not switch off
    # the password an operator still has under the old name.
    monkeypatch.setenv(NEW, "")
    monkeypatch.setenv(OLD, "old")

    assert env(NEW) == "old"


def test_env_blank_value_is_kept_when_nothing_else_is_set(monkeypatch):
    # A blank value is not "unset": os.getenv(name, "5") returns "" for it, so
    # callers (e.g. an auth password of "" = off) keep the behaviour they had.
    monkeypatch.setenv(OLD, "")

    assert env(NEW, "5") == ""


def test_env_name_without_a_legacy_name_is_a_plain_read(monkeypatch):
    monkeypatch.setenv("SURREAL_USER", "root")
    monkeypatch.delenv("NOT_A_SETTING", raising=False)

    assert env("SURREAL_USER") == "root"
    assert env("NOT_A_SETTING", "x") == "x"


@pytest.mark.parametrize("secret", ["LSP_SIET_PASSWORD", "LSP_SIET_ENCRYPTION_KEY"])
def test_secret_file_variant_falls_back_too(monkeypatch, tmp_path, secret, warnings):
    """Docker secrets: LSP_SIET_X_FILE, then OPEN_NOTEBOOK_X_FILE, then the plain name."""
    old = LEGACY_NAMES[secret]
    for name in (secret, old, f"{secret}_FILE", f"{old}_FILE"):
        monkeypatch.delenv(name, raising=False)
    old_file = tmp_path / "old"
    old_file.write_text("from-old-file\n")
    new_file = tmp_path / "new"
    new_file.write_text("from-new-file\n")

    monkeypatch.setenv(old, "plain-old")
    assert enc.get_secret_from_env(secret) == "plain-old"

    monkeypatch.setenv(f"{old}_FILE", str(old_file))
    assert enc.get_secret_from_env(secret) == "from-old-file"

    monkeypatch.setenv(f"{secret}_FILE", str(new_file))
    assert enc.get_secret_from_env(secret) == "from-new-file"


def test_legacy_names_pair_each_new_name_with_its_old_one():
    assert LEGACY_NAMES, "the table is empty"
    for new, old in LEGACY_NAMES.items():
        prefix = "NEXT_PUBLIC_" if new.startswith("NEXT_PUBLIC_") else ""
        assert new == f"{prefix}LSP_SIET_{old.removeprefix(prefix + 'OPEN_NOTEBOOK_')}", (new, old)
        assert old.startswith(f"{prefix}OPEN_NOTEBOOK_"), old
    assert len(set(LEGACY_NAMES.values())) == len(LEGACY_NAMES), "two names share an old name"


def test_moves_env_renames_is_the_inverse_of_legacy_names():
    """The codemod rewrites teammates' branches from the same list."""
    spec = importlib.util.spec_from_file_location("lsp_moves", REPO / "scripts/lsp-siet/moves.py")
    moves = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(moves)

    assert moves.ENV_RENAMES == {old: new for new, old in LEGACY_NAMES.items()}


# Files that may name an OPEN_NOTEBOOK_ setting: the tables themselves and the tests.
_TABLES = {
    "platform/siet_core/env.py",
    "platform/frontend/src/lib/env.ts",
    "my-ai-quiz/app/app/lib/env.ts",
    "ai-roadmap/app/src/lib/env.js",
}
_SOURCE_DIRS = (
    "platform/siet_core",
    "platform/api",
    "platform/commands",
    "platform/siet_platform",
    "platform/frontend/src",
    "platform/frontend/next.config.ts",
    "kmitl-rag/kmitl_rag",
    "kmitl-rag/frontend/src",
    "community/siet_community",
    "community/frontend/src",
    "my-ai-quiz/siet_quiz",
    "my-ai-quiz/frontend/src",
    "my-ai-quiz/app/app",
    "ai-roadmap/siet_roadmap",
    "ai-roadmap/frontend/src",
    "ai-roadmap/app/src",
)
_CODE = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs"}


def _code_files():
    for entry in _SOURCE_DIRS:
        root = REPO / entry
        assert root.exists(), f"{entry} is gone: update _SOURCE_DIRS, a missing folder must not shrink the scan"
        if root.is_file():
            yield root
            continue
        for path in root.rglob("*"):
            if path.suffix in _CODE and "node_modules" not in path.parts and ".next" not in path.parts:
                yield path


def test_no_code_reads_an_old_name_directly():
    """Every read goes through env(); only the tables name the old settings."""
    hits = []
    for path in _code_files():
        rel = path.relative_to(REPO).as_posix()
        if rel in _TABLES or ".test." in path.name:
            continue
        for number, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
            if re.search(r"OPEN_NOTEBOOK_", line):
                hits.append(f"{rel}:{number}: {line.strip()}")
    assert hits == [], "\n".join(hits)


def _table_pairs(path: str) -> dict[str, str]:
    """The ``'NEW': 'OLD'`` pairs of a TypeScript/JavaScript LEGACY_NAMES literal."""
    text = (REPO / path).read_text()
    body = re.search(r"export const LEGACY_NAMES[^=]*=\s*\{(.*?)\}", text, re.S).group(1)
    return dict(re.findall(r"['\"]?([A-Z0-9_]+)['\"]?\s*:\s*['\"]([A-Z0-9_]+)['\"]", body))


@pytest.mark.parametrize("path", sorted(_TABLES - {"platform/siet_core/env.py"}))
def test_typescript_tables_agree_with_the_python_one(path):
    pairs = _table_pairs(path)
    assert pairs, f"{path} has no LEGACY_NAMES entries"
    for new, old in pairs.items():
        assert LEGACY_NAMES.get(new) == old, f"{path}: {new} -> {old}"
