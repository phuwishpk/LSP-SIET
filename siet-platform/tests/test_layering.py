"""
The layering of the backend (docs/ARCHITECTURE.md):

    open_notebook / api / commands  <-  siet_platform  <-  kmitl_rag  <-  siet_community

A package may import only from its own layer or the ones to its left; open-notebook
imports none of the SIET packages (it reaches them through open_notebook.extensions).
Tests may cross layers.
"""

import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
LAYERS = ["core", "siet_platform", "kmitl_rag", "siet_community"]
SOURCES = {
    "core": [ROOT / "open-notebook" / d for d in ("api", "open_notebook", "commands")],
    "siet_platform": [ROOT / "siet-platform" / "siet_platform"],
    "kmitl_rag": [ROOT / "kmitl-rag" / "kmitl_rag"],
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
    return top if top in LAYERS else None


@pytest.mark.parametrize("layer", LAYERS)
def test_no_imports_from_higher_layers(layer):
    allowed = set(LAYERS[: LAYERS.index(layer) + 1])
    offenders = []
    for base in SOURCES[layer]:
        for path in sorted(base.rglob("*.py")):
            if ".venv" in path.parts:
                continue
            for lineno, module in imported_modules(path):
                target = layer_of(module)
                if target is not None and target not in allowed:
                    offenders.append(f"{path.relative_to(ROOT)}:{lineno} imports {module}")
    assert not offenders, "imports against the layering:\n" + "\n".join(offenders)
