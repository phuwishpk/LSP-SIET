"""The infrastructure files (Dockerfiles, compose, CI, deploy scripts) use the LSP-SIET layout.

    python -m pytest scripts/lsp-siet/test_infra_paths.py -q

Scans the files that name repository paths, container names or image names. docs/** and
scripts/lsp-siet/** are not scanned: the codemod's rename table has to contain the old names.
"""

from __future__ import annotations

import fnmatch
import os
import re
import shlex
import sys
from pathlib import Path

import pytest

sys.dont_write_bytecode = True  # keep scripts/lsp-siet/ free of .pyc files

ROOT = Path(__file__).resolve().parents[2]

# Files and folders (relative to the repo root) that carry repo paths, container or image names.
INFRA = [
    "my-ai-quiz/app/Dockerfile",
    "ai-roadmap/app/Dockerfile",
    "docker/platform",
    "docker/allinone",
    "docker/traefik",
    "docker-compose.yml",
    "docker-compose-dev.yml",
    "docker-compose.prod.yml",
    "Makefile",
    "dev.sh",
    "deploy/deploy.sh",
    "deploy/export-data.sh",
    "deploy/import-data.sh",
    "deploy/migrate-to-allinone.sh",
    ".github/workflows/image.yml",
    ".gitignore",
    ".dockerignore",
]

DOCKERFILES = [
    "my-ai-quiz/app/Dockerfile",
    "ai-roadmap/app/Dockerfile",
    "docker/platform/Dockerfile",
    "docker/allinone/Dockerfile",
]

OLD_NAMES = [
    "open-notebook/",
    "open_notebook_api",
    "kmitl_open_notebook_api",
    "kmitlai/open-notebook",
    "My-ai-quiz",
    "ai-roadmap-generator",
    "siet-platform/",
]


def infra_files() -> list[Path]:
    files: list[Path] = []
    for entry in INFRA:
        path = ROOT / entry
        if path.is_dir():
            files += [p for p in sorted(path.rglob("*")) if p.is_file()]
        elif path.is_file():
            files.append(path)
        else:
            raise AssertionError(f"infra file {entry} does not exist")
    return files


def test_no_old_paths_in_infra():
    hits = []
    for path in infra_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), 1):
            for old in OLD_NAMES:
                if old in line:
                    hits.append(f"{path.relative_to(ROOT)}:{number}: {old!r}: {line.strip()}")
    assert not hits, "old names left in infra files:\n" + "\n".join(hits)


def copy_sources(dockerfile: Path) -> list[tuple[int, str]]:
    """(line number, source) of every COPY from the build context (not `--from=`)."""
    sources: list[tuple[int, str]] = []
    lines = dockerfile.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        start = i + 1
        line = lines[i]
        i += 1
        while line.rstrip().endswith("\\") and i < len(lines):  # a continued instruction
            line = line.rstrip()[:-1] + " " + lines[i]
            i += 1
        match = re.match(r"\s*COPY\s+(.*)", line)
        if not match:
            continue
        words = shlex.split(match.group(1), comments=True)
        flags = [w for w in words if w.startswith("--")]
        args = [w for w in words if not w.startswith("--")]
        if any(f.startswith("--from=") for f in flags):
            continue
        sources += [(start, s) for s in args[:-1]]
    return sources


def exists_exact(rel: str) -> bool:
    """Does `rel` (it may hold * ? [] globs) exist under the repo root, case-sensitively?

    The build runs on Linux; a plain exists() on a case-insensitive disk (macOS) would
    accept `My-ai-quiz/...` for `my-ai-quiz/...`.
    """
    def walk(base: Path, parts: list[str]) -> bool:
        if not parts:
            return True
        if not base.is_dir():
            return False
        names = os.listdir(base)
        head, rest = parts[0], parts[1:]
        matches = fnmatch.filter(names, head) if re.search(r"[*?\[]", head) else [n for n in names if n == head]
        return any(walk(base / n, rest) for n in matches)

    return walk(ROOT, [p for p in rel.split("/") if p not in ("", ".")])


def test_every_copy_source_exists():
    missing = []
    for name in DOCKERFILES:
        dockerfile = ROOT / name
        assert dockerfile.is_file(), f"{name} does not exist"
        for number, source in copy_sources(dockerfile):
            # The build context is the repository root for every Dockerfile.
            if not exists_exact(source):
                missing.append(f"{name}:{number}: COPY {source}")
    assert not missing, "COPY sources that do not exist:\n" + "\n".join(missing)


def test_copy_parser_ignores_stage_copies_and_flags(tmp_path):
    dockerfile = tmp_path / "Dockerfile"
    dockerfile.write_text(
        "COPY --from=web --chown=lsp:lsp /app/x /app/x\n"
        "COPY --chown=a:b shared /shared\n"
        "COPY a.json b.json* ./\n"
        "COPY \\\n  x/y \\\n  z /dst/\n"
        "RUN echo COPY not-this /x\n"
    )
    assert [s for _, s in copy_sources(dockerfile)] == ["shared", "a.json", "b.json*", "x/y", "z"]


def test_exists_exact_is_case_sensitive():
    assert exists_exact("my-ai-quiz/app/Dockerfile")
    assert exists_exact("my-ai-quiz/app/package-lock.json*")
    assert not exists_exact("My-ai-quiz/app/Dockerfile")
    assert not exists_exact("my-ai-quiz/App")


def test_known_failures_file_is_sorted_and_used_by_ci():
    """CI deselects exactly the ids in docs/lsp-siet/known-failures.txt (one per line, C-sorted)."""
    lines = (ROOT / "docs/lsp-siet/known-failures.txt").read_text(encoding="utf-8").splitlines()
    ids = [line for line in lines if line and not line.startswith("#")]
    assert ids, "known-failures.txt lists no test"
    assert ids == sorted(ids, key=lambda s: s.encode()), "ids must be sorted with LC_ALL=C sort"
    assert len(ids) == len(set(ids)), "duplicate ids"
    assert all(i == i.rstrip() and "::" in i for i in ids), "an id has trailing blanks or is not a node id"
    workflow = (ROOT / ".github/workflows/image.yml").read_text(encoding="utf-8")
    assert "docs/lsp-siet/known-failures.txt" in workflow and '--deselect "$id"' in workflow


# --- settings: LSP_SIET_* in the infra files, the old OPEN_NOTEBOOK_* names only as fallbacks ---

COMPOSE_FILES = ["docker-compose.yml", "docker-compose-dev.yml", "docker-compose.prod.yml"]
# `- LSP_SIET_<container variable>=${LSP_SIET_<.env name>:-${OPEN_NOTEBOOK_<.env name>:-default}}`
FALLBACK = re.compile(r"- LSP_SIET_(\w+)=\$\{LSP_SIET_(\w+):-\$\{OPEN_NOTEBOOK_\2:-")


def test_infra_names_settings_with_the_new_names_only_as_fallbacks():
    """Production .env files keep the old names; the infra reads them only as `${NEW:-${OLD:-x}}`."""
    hits = []
    for path in infra_files():
        text = path.read_text(encoding="utf-8", errors="replace")
        for number, line in enumerate(text.splitlines(), 1):
            for match in re.finditer(r"OPEN_NOTEBOOK_", line):
                if line[: match.start()].endswith("-${"):
                    continue
                hits.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()}")
    assert not hits, "old setting names outside a fallback:\n" + "\n".join(hits)


def legacy_names() -> dict[str, str]:
    """new -> old, read from the table in platform/siet_core/env.py (it is not importable here)."""
    text = (ROOT / "platform/siet_core/env.py").read_text(encoding="utf-8")
    return dict(re.findall(r'"((?:NEXT_PUBLIC_)?LSP_SIET_\w+)": "((?:NEXT_PUBLIC_)?OPEN_NOTEBOOK_\w+)"', text))


def test_compose_reads_every_renamed_setting_with_its_old_name_as_fallback():
    """`${LSP_SIET_X:-...}` of a renamed setting must be `${LSP_SIET_X:-${OPEN_NOTEBOOK_X:-...}}`."""
    table = legacy_names()
    assert len(table) > 40, "could not read LEGACY_NAMES"
    missing = []
    for compose in COMPOSE_FILES:
        for number, line in enumerate((ROOT / compose).read_text(encoding="utf-8").splitlines(), 1):
            for match in re.finditer(r"\$\{(LSP_SIET_\w+):-", line):
                new = match.group(1)
                if new in table and not line[match.end():].startswith("${" + table[new] + ":-"):
                    missing.append(f"{compose}:{number}: {new} has no {table[new]} fallback")
    assert not missing, "\n".join(missing)


def compose_environment(compose: str, env_file: Path) -> dict[str, dict[str, str]]:
    import json
    import subprocess

    done = subprocess.run(
        ["docker", "compose", "-f", str(ROOT / compose), "--env-file", str(env_file), "config", "--format", "json"],
        capture_output=True, text=True, cwd=ROOT,
    )
    assert done.returncode == 0, done.stderr
    return {name: svc.get("environment") or {} for name, svc in json.loads(done.stdout)["services"].items()}


def has_docker_compose() -> bool:
    import shutil
    import subprocess

    if not shutil.which("docker"):
        return False
    return subprocess.run(["docker", "compose", "version"], capture_output=True).returncode == 0


@pytest.mark.skipif(not has_docker_compose(), reason="docker compose is not installed")
@pytest.mark.parametrize("compose", COMPOSE_FILES)
def test_compose_reads_the_old_setting_names_and_prefers_the_new(compose, tmp_path):
    text = (ROOT / compose).read_text(encoding="utf-8")
    pairs = sorted(set(FALLBACK.findall(text)))  # (container variable, .env name)
    assert pairs, f"{compose} has no setting with a fallback"

    def resolved(lines: str, name: str) -> dict[str, str]:
        env_file = tmp_path / name
        env_file.write_text(lines)
        return {k: v for env in compose_environment(compose, env_file).values() for k, v in env.items()}

    seen = resolved("".join(f"OPEN_NOTEBOOK_{n}=old-{n}\n" for _, n in pairs), "old.env")
    for var, n in pairs:
        assert seen.get(f"LSP_SIET_{var}") == f"old-{n}", f"{compose}: an OPEN_NOTEBOOK_{n} .env line is lost"

    seen = resolved("".join(f"OPEN_NOTEBOOK_{n}=old-{n}\nLSP_SIET_{n}=new-{n}\n" for _, n in pairs), "both.env")
    for var, n in pairs:
        assert seen.get(f"LSP_SIET_{var}") == f"new-{n}", f"{compose}: LSP_SIET_{n} does not win"

    seen = resolved("".join(f"OPEN_NOTEBOOK_{n}=old-{n}\nLSP_SIET_{n}=\n" for _, n in pairs), "blank.env")
    for var, n in pairs:
        assert seen.get(f"LSP_SIET_{var}") == f"old-{n}", f"{compose}: a blank LSP_SIET_{n} shadows the old name"
