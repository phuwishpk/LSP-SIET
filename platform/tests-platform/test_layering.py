"""
The layering of the backend (docs/ARCHITECTURE.md), a graph rather than a line:

    siet_core / api / commands  <-  siet_platform  <-  kmitl_rag     <-  siet_community
                                    siet_platform  <-  siet_quiz     <-  siet_community
                                    siet_platform  <-  siet_roadmap  <-  siet_community

A package may import only the packages ALLOWED lists for it: siet_core, api and
commands import none of the SIET packages (they reach them through
siet_core.extensions); kmitl_rag, siet_quiz and siet_roadmap know nothing of each
other; only siet_community may import all of them. Tests may cross layers.
"""

import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CORE_MODULES = {"siet_core", "api", "commands"}
ALLOWED: dict[str, set[str]] = {
    "core": {"core"},
    "siet_platform": {"core", "siet_platform"},
    "kmitl_rag": {"core", "siet_platform", "kmitl_rag"},
    "siet_quiz": {"core", "siet_platform", "siet_quiz"},
    "siet_roadmap": {"core", "siet_platform", "siet_roadmap"},
    "siet_community": {"core", "siet_platform", "kmitl_rag", "siet_quiz", "siet_roadmap", "siet_community"},
}
SOURCES = {
    "core": [ROOT / "platform" / d for d in ("api", "siet_core", "commands")],
    "siet_platform": [ROOT / "platform" / "siet_platform"],
    "kmitl_rag": [ROOT / "kmitl-rag" / "kmitl_rag"],
    "siet_quiz": [ROOT / "my-ai-quiz" / "siet_quiz"],
    "siet_roadmap": [ROOT / "ai-roadmap" / "siet_roadmap"],
    "siet_community": [ROOT / "community" / "siet_community"],
}


def imported_modules(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                yield node.lineno, alias.name
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            yield node.lineno, node.module


def layer_of(module: str):
    top = module.split(".")[0]
    if top in CORE_MODULES:
        return "core"
    return top if top in ALLOWED else None


def test_every_layer_has_its_sources_and_rules():
    assert set(SOURCES) == set(ALLOWED)
    for layer, allowed in ALLOWED.items():
        assert layer in allowed and allowed <= set(ALLOWED)


@pytest.mark.parametrize("layer", list(ALLOWED))
def test_no_imports_against_the_graph(layer):
    allowed = ALLOWED[layer]
    offenders = []
    for base in SOURCES[layer]:
        assert base.is_dir(), f"layer {layer}: source directory {base} is missing"
        for path in sorted(base.rglob("*.py")):
            if ".venv" in path.parts:
                continue
            for lineno, module in imported_modules(path):
                target = layer_of(module)
                if target is not None and target not in allowed:
                    offenders.append(f"{path.relative_to(ROOT)}:{lineno} imports {module}")
    assert not offenders, "imports against the layering:\n" + "\n".join(offenders)
