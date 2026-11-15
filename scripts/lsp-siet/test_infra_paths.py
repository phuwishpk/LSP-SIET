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


def test_ci_runs_the_layout_tool_tests_with_the_project_venv():
    """The codemod, the infra-path tests and the Open Notebook guard are tests like any other:
    CI runs `pytest scripts/lsp-siet` in the venv `uv sync` built (so a teammate's PR that breaks
    the codemod table, an infra path or the no-old-name rule fails the checks job)."""
    workflow = (ROOT / ".github/workflows/image.yml").read_text(encoding="utf-8")
    checks = workflow.split("\n  image:")[0]
    steps = checks.split("\n      - ")
    step = next((s for s in steps if "../scripts/lsp-siet" in s), "")
    assert "python -m pytest ../scripts/lsp-siet" in step, "image.yml checks job does not run scripts/lsp-siet"
    assert "uv run --no-sync" in step and "working-directory: platform" in step
    assert "PYTHON_DOTENV_DISABLED" in step
    # after the step that creates the venv
    assert checks.index("uv sync --frozen") < checks.index("../scripts/lsp-siet")


# --- settings: LSP_SIET_* in the infra files, the old OPEN_NOTEBOOK_* names only as fallbacks ---

COMPOSE_FILES = ["docker-compose.yml", "docker-compose-dev.yml", "docker-compose.prod.yml"]
# `- LSP_SIET_<container variable>=${LSP_SIET_<.env name>:-${OPEN_NOTEBOOK_<.env name>:-default}}`
FALLBACK = re.compile(r"- LSP_SIET_(\w+)=\$\{LSP_SIET_(\w+):-\$\{OPEN_NOTEBOOK_\2:-")


# Rollback passthrough (ruling R38): for one release docker-compose.yml and docker-compose.prod.yml also set
# the OLD container variable, to exactly the value of its LSP_SIET_* twin, because an image from before the
# restructure (deploy.sh's rollback, or a retagged kmitlai/open-notebook image) reads only the old names.
#   - OPEN_NOTEBOOK_X=<rhs>          needs   - LSP_SIET_X=<rhs>          (same file, same right-hand side)
#   - NEXT_PUBLIC_OPEN_NOTEBOOK_X=<rhs>      - NEXT_PUBLIC_LSP_SIET_X=<rhs>
ROLLBACK_FILES = ["docker-compose.yml", "docker-compose.prod.yml"]
PASSTHROUGH = re.compile(r"^\s*- (NEXT_PUBLIC_)?OPEN_NOTEBOOK_(\w+)=(.*)$")
ENV_ITEM = re.compile(r"^\s*- ((?:NEXT_PUBLIC_)?(?:LSP_SIET|OPEN_NOTEBOOK)_\w+)=(.*)$")

# What the compose files of main (8efc391) handed to the containers under old names, per file and service.
OLD_IMAGE_SETTINGS: dict[str, dict[str, list[str]]] = {
    "docker-compose.prod.yml": {
        "lsp-siet": [
            "ENCRYPTION_KEY", "PASSWORD", "MAX_UPLOAD_SIZE_MB", "ANSWER_CACHE_INTENT_TIMEOUT_MS",
            "ANSWER_CACHE_TUNER_ENABLED", "ANSWER_CACHE_TUNER_INTERVAL", "ANSWER_CACHE_TUNER_HIGH_MIN",
            "ANSWER_CACHE_TUNER_HIGH_MAX", "ANSWER_CACHE_TUNER_MID_MIN", "ANSWER_CACHE_TUNER_MID_MAX",
        ],
    },
    "docker-compose.yml": {
        "lsp_siet_api": [
            "ENCRYPTION_KEY", "MAX_UPLOAD_SIZE_MB", "ANSWER_CACHE_INTENT_TIMEOUT_MS",
            "ANSWER_CACHE_TUNER_ENABLED", "ANSWER_CACHE_TUNER_INTERVAL", "ANSWER_CACHE_TUNER_HIGH_MIN",
            "ANSWER_CACHE_TUNER_HIGH_MAX", "ANSWER_CACHE_TUNER_MID_MIN", "ANSWER_CACHE_TUNER_MID_MAX",
        ],
        "my_ai_quiz": ["NEXT_PUBLIC_API_URL", "API_URL", "API_KEY"],
        "ai_roadmap_generator": ["API_URL"],
    },
}


def rollback_passthrough_lines(text: str) -> dict[int, tuple[str, str]]:
    """line number -> (old container variable, right-hand side) of every passthrough line that has its LSP_SIET_ twin."""
    twins = {name: rhs for line in text.splitlines() if (m := ENV_ITEM.match(line)) for name, rhs in [m.groups()]}
    found: dict[int, tuple[str, str]] = {}
    for number, line in enumerate(text.splitlines(), 1):
        m = PASSTHROUGH.match(line)
        if not m:
            continue
        prefix, name, rhs = m.group(1) or "", m.group(2), m.group(3)
        if twins.get(f"{prefix}LSP_SIET_{name}") == rhs:
            found[number] = (f"{prefix}OPEN_NOTEBOOK_{name}", rhs)
    return found


def test_infra_names_settings_with_the_new_names_only_as_fallbacks():
    """Production .env files keep the old names; the infra reads them only as `${NEW:-${OLD:-x}}`
    (and, in the two compose files that can start an old image, passes them on under the old name: R38)."""
    hits = []
    for path in infra_files():
        rel = str(path.relative_to(ROOT))
        text = path.read_text(encoding="utf-8", errors="replace")
        passthrough = rollback_passthrough_lines(text) if rel in ROLLBACK_FILES else {}
        for number, line in enumerate(text.splitlines(), 1):
            if number in passthrough:
                continue
            for match in re.finditer(r"OPEN_NOTEBOOK_", line):
                if line[: match.start()].endswith("-${"):
                    continue
                hits.append(f"{rel}:{number}: {line.strip()}")
    assert not hits, "old setting names outside a fallback:\n" + "\n".join(hits)


@pytest.mark.parametrize("compose", ROLLBACK_FILES)
def test_rollback_passthrough_says_when_to_remove_it(compose):
    lines = (ROOT / compose).read_text(encoding="utf-8").splitlines()
    marks = [n for n, line in enumerate(lines, 1) if line.lstrip().startswith("#") and "ROLLBACK" in line
             and "remove after the first release on the new layout" in line]
    passthrough = rollback_passthrough_lines("\n".join(lines))
    assert passthrough and marks, f"{compose} has no rollback passthrough lines or no ROLLBACK comment"
    # every passthrough line sits in a block that starts with such a comment (list items in between only)
    for number in passthrough:
        n = number - 1
        while n >= 1 and lines[n - 1].lstrip().startswith("- "):
            n -= 1
        while n >= 1 and lines[n - 1].lstrip().startswith("#"):
            if n in marks:
                break
            n -= 1
        assert n in marks, f"{compose}:{number}: passthrough line without a ROLLBACK comment above its block"


@pytest.mark.parametrize("compose", ROLLBACK_FILES)
def test_compose_passes_every_old_setting_an_old_image_reads(compose):
    """The settings the compose files of main handed to the containers under the old names (derived from
    8efc391) are all passed on under those names, so a pre-restructure image finds its key and password."""
    lines = (ROOT / compose).read_text(encoding="utf-8")
    present = {name for name, _ in rollback_passthrough_lines(lines).values()}
    missing = [
        f"{service}: OPEN_NOTEBOOK_{var}"
        for service, variables in OLD_IMAGE_SETTINGS[compose].items()
        for var in variables
        if (f"NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL" if var == "NEXT_PUBLIC_API_URL" else f"OPEN_NOTEBOOK_{var}") not in present
    ]
    assert not missing, f"{compose} does not pass these old names (a pre-restructure image would not see them):\n" + "\n".join(missing)


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


@pytest.mark.skipif(not has_docker_compose(), reason="docker compose is not installed")
@pytest.mark.parametrize("compose", ROLLBACK_FILES)
def test_old_image_under_the_new_compose_gets_the_old_names_with_equal_values(compose, tmp_path):
    """`docker compose config` with an .env that only has the old names: every container variable of a
    pre-restructure image exists and equals its LSP_SIET_ twin; with both names set, both carry the new value."""
    twins = sorted({
        (name, rhs) for name, rhs in rollback_passthrough_lines((ROOT / compose).read_text(encoding="utf-8")).values()
    })
    assert twins

    def containers(lines: str, name: str) -> dict[str, dict[str, str]]:
        env_file = tmp_path / name
        env_file.write_text(lines)
        return compose_environment(compose, env_file)

    old_only = "OPEN_NOTEBOOK_ENCRYPTION_KEY=old-key\nOPEN_NOTEBOOK_PASSWORD=old-pass\nOPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB=512\n"
    both = old_only + "LSP_SIET_ENCRYPTION_KEY=new-key\nLSP_SIET_PASSWORD=new-pass\nLSP_SIET_MAX_UPLOAD_SIZE_MB=1024\n"
    for env_name, content, key, password in (("old.env", old_only, "old-key", "old-pass"), ("both.env", both, "new-key", "new-pass")):
        services = containers(content, env_name)
        for service, variables in OLD_IMAGE_SETTINGS[compose].items():
            env = services[service]
            for var in variables:
                old_name = "NEXT_PUBLIC_OPEN_NOTEBOOK_API_URL" if var == "NEXT_PUBLIC_API_URL" else f"OPEN_NOTEBOOK_{var}"
                new_name = old_name.replace("OPEN_NOTEBOOK", "LSP_SIET")
                assert old_name in env, f"{compose}/{service}: {old_name} is not passed ({env_name})"
                assert env[old_name] == env[new_name], f"{compose}/{service}: {old_name}={env[old_name]!r} differs from {new_name}={env[new_name]!r} ({env_name})"
        env = next(e for e in services.values() if "OPEN_NOTEBOOK_ENCRYPTION_KEY" in e)
        assert env["OPEN_NOTEBOOK_ENCRYPTION_KEY"] == key and env["LSP_SIET_ENCRYPTION_KEY"] == key
        if "OPEN_NOTEBOOK_PASSWORD" in env:
            assert env["OPEN_NOTEBOOK_PASSWORD"] == password
