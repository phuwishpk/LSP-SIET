"""AI roadmap generation: the shape the model's JSON is cleaned into, and the extension's routes."""

import asyncio

import pytest
from fastapi import FastAPI
from fastapi.routing import APIRoute

from siet_core.exceptions import ExternalServiceError, InvalidInputError
from siet_roadmap import extension, service


def test_edges_to_unknown_nodes_are_dropped_and_ids_kept_unique():
    clean = service._enforce_roadmap_invariants(
        {
            "title": " Plan ",
            "nodes": [{"id": "a", "label": "A"}, {"id": "a", "label": "A again"}, {"label": "C"}],
            "edges": [{"source": "a", "target": "C"}, {"from": "a", "to": "ghost"}, {"source": "a", "target": "a"}],
        }
    )
    assert clean["title"] == "Plan"
    assert [n["id"] for n in clean["nodes"]] == ["a", "a_2", "C"]
    assert clean["edges"] == [{"source": "a", "target": "C"}]


def test_no_usable_edge_means_a_sequential_chain():
    clean = service._enforce_roadmap_invariants({"nodes": [{"id": "x"}, {"id": "y"}, {"id": "z"}]})
    assert clean["edges"] == [{"source": "x", "target": "y"}, {"source": "y", "target": "z"}]


def test_too_few_nodes_or_bad_input_is_refused():
    with pytest.raises(ExternalServiceError):
        service._enforce_roadmap_invariants({"nodes": [{"id": "x"}, {"id": "y"}]})
    with pytest.raises(InvalidInputError):
        asyncio.run(service.generate_roadmap(owner_id="u1", description="   "))
    with pytest.raises(InvalidInputError):
        asyncio.run(service.generate_roadmap(owner_id="u1", description="app", node_count=2))


def test_install_mounts_the_roadmap_routes_under_api():
    app = FastAPI()
    extension.install(app)
    routes = [(m, r.path) for r in app.routes if isinstance(r, APIRoute) for m in sorted(r.methods)]
    assert routes == [
        ("POST", "/api/features/roadmap/generate"),
        ("GET", "/api/features/roadmap/sessions"),
        ("GET", "/api/features/roadmap/sessions/{session_id}"),
        ("DELETE", "/api/features/roadmap/sessions/{session_id}"),
        ("DELETE", "/api/admin/roadmaps/{session_id}"),
    ]
