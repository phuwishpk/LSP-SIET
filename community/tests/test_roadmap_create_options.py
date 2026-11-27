"""Creating a roadmap: several courses / notebooks / my files at once, more files, and learner preferences."""

import asyncio

import pytest
from pydantic import ValidationError
from siet_community import roadmap_plan
from siet_community.routers import community as router


def _body(**kw):
    return router.StudyRoadmapBody(description="Python", **kw)


@pytest.fixture
def scopes(monkeypatch):
    state = {"calls": []}

    async def for_scope(user, scope, course_id=None, document_ids=None):
        state["calls"].append((scope, course_id))
        return {"course": [f"notebook:c{course_id}"], "personal": ["notebook:me"]}[scope]

    async def pick(user, document_ids, notebook_ids, source_ids):
        if not (document_ids or notebook_ids or source_ids):
            return None
        if notebook_ids:
            return ["notebook:staff"], None, "Notebook"
        return ["notebook:me"], ["source:a"], "เอกสารที่เลือก"

    async def sources_of(notebook_ids):
        return [f"source:in-{n.split(':')[1]}" for n in notebook_ids]

    monkeypatch.setattr(router.library, "notebook_ids_for_scope", for_scope)
    monkeypatch.setattr(router, "_resolve_pick", pick)
    monkeypatch.setattr(router.library, "source_ids_of_notebooks", sources_of)
    return state


def _scope(body):
    return asyncio.run(router._study_scope(object(), body))


def test_several_courses_and_my_files_together(scopes):
    notebooks, sources, label = _scope(_body(scope="document", course_ids=[1, 2], include_personal=True))
    assert notebooks == ["notebook:c1", "notebook:c2", "notebook:me"]
    assert sources is None
    assert label == "แหล่งความรู้ที่เลือก 3 แหล่ง"


def test_whole_courses_with_single_files_search_only_those_files_outside_the_courses(scopes):
    notebooks, sources, _ = _scope(_body(scope="document", course_ids=[1], document_ids=[7]))
    assert notebooks == ["notebook:c1", "notebook:me"]
    # the picked file narrows its own notebook; the whole course stays whole
    assert sources == ["source:a", "source:in-c1"]


def test_whole_notebooks_with_courses_stay_whole(scopes):
    notebooks, sources, label = _scope(_body(scope="notebook", course_ids=[3], notebook_ids=["notebook:staff"]))
    assert notebooks == ["notebook:c3", "notebook:staff"] and sources is None
    assert label == "แหล่งความรู้ที่เลือก 2 แหล่ง"


def test_nothing_picked_is_refused(scopes):
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        _scope(_body(scope="document"))


def test_limits():
    _body(document_ids=list(range(50)), source_ids=[f"source:{i}" for i in range(50)], course_ids=list(range(10)))
    for too_many in ({"document_ids": list(range(51))}, {"course_ids": list(range(11))}, {"source_ids": ["s"] * 51}):
        with pytest.raises(ValidationError):
            _body(**too_many)


def test_preferences_are_checked():
    body = _body(level="beginner", duration="1m", focus="project")
    assert body.preferences() == {"level": "beginner", "duration": "1m", "focus": "project"}
    assert _body().preferences() == {}
    with pytest.raises(ValidationError):
        _body(level="expert")


def test_prompt_carries_the_preferences():
    prompt = roadmap_plan._plan_prompt("Python", "th", None, [], {"level": "beginner", "duration": "1m", "focus": "exam"})
    assert "complete beginner" in prompt and "one month" in prompt and "exam" in prompt
    assert "week" in prompt  # pacing hint for a time frame
    plain = roadmap_plan._plan_prompt("Python", "th", None, [])
    assert "Time available" not in plain and "Learner's level" not in plain


def test_preferences_change_the_cache_key(monkeypatch):
    keys = []

    async def fake_get(key):
        keys.append(key)
        return {"payload": {"title": "t", "nodes": [], "edges": [], "grounding": {"library": False, "web": False}}}

    class Saved:
        def __init__(self, **kw):
            self.__dict__.update(kw, id="roadmap_session:x", grounding=kw.get("grounding"))

        async def save(self):
            return None

    monkeypatch.setattr(roadmap_plan.cache_service, "get_json", fake_get)
    monkeypatch.setattr(roadmap_plan, "RoadmapSession", Saved)
    for prefs in (None, {"level": "advanced"}):
        asyncio.run(roadmap_plan.generate_plan(owner_id="1", description="Python", preferences=prefs))
    assert len(set(keys)) == 2
