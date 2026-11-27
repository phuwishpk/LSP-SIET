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
    """The library as the scope code sees it: courses c1..c3, my library, staff notebooks s1/s2."""
    state = {"sources_of": []}
    sources_in = {"notebook:c1": ["source:c1a"], "notebook:c2": ["source:c2a"], "notebook:c3": ["source:c3a"],
                  "notebook:me": ["source:me1", "source:me2"], "notebook:s1": ["source:s1a"], "notebook:s2": ["source:s2a"]}
    docs = {7: ("notebook:me", "source:me1"), 8: ("notebook:c2", "source:c2a"), 9: ("notebook:c3", None)}

    async def for_scope(user, scope, course_id=None, document_ids=None):
        return {"course": [f"notebook:c{course_id}"], "personal": ["notebook:me"]}[scope]

    async def knowledge_pick(user, *, notebook_ids=None, source_ids=None):
        if source_ids:
            return {"notebook_ids": ["notebook:s2"], "source_ids": list(source_ids), "label": "x"}
        return {"notebook_ids": list(notebook_ids), "source_ids": None, "label": "x"}

    async def for_documents(user, document_ids):
        picked = [docs[i] for i in document_ids]
        sources = [src for _, src in picked if src]
        return {"notebook_ids": list(dict.fromkeys(nb for nb, _ in picked)),
                "source_ids": sources if len(sources) == len(picked) else None}

    async def sources_of(notebook_ids):
        state["sources_of"].append(list(notebook_ids))
        return [s for n in notebook_ids for s in sources_in[n]]

    async def old_pick(user, document_ids, notebook_ids, source_ids):
        state["old_pick"] = True
        return ["notebook:me"], ["source:me1"], "เอกสารที่เลือก"

    monkeypatch.setattr(router.library, "notebook_ids_for_scope", for_scope)
    monkeypatch.setattr(router.library, "resolve_knowledge_pick", knowledge_pick)
    monkeypatch.setattr(router.library, "scope_for_documents", for_documents)
    monkeypatch.setattr(router.library, "source_ids_of_notebooks", sources_of)
    monkeypatch.setattr(router, "_resolve_pick", old_pick)
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
    # the picked file narrows its own notebook (not source:me2); the whole course stays whole
    assert sources == ["source:me1", "source:c1a"]


def test_a_whole_notebook_and_a_file_from_another_notebook_are_both_read(scopes):
    notebooks, sources, label = _scope(_body(scope="document", notebook_ids=["notebook:s1"], source_ids=["source:s2a"]))
    assert notebooks == ["notebook:s1", "notebook:s2"]
    assert sources == ["source:s2a", "source:s1a"]
    assert label == "แหล่งความรู้ที่เลือก 2 แหล่ง"


def test_a_whole_notebook_does_not_open_up_a_picked_files_notebook(scopes):
    notebooks, sources, _ = _scope(_body(scope="document", notebook_ids=["notebook:s1"], document_ids=[8]))
    assert notebooks == ["notebook:s1", "notebook:c2"]
    assert sources == ["source:c2a", "source:s1a"]  # course c2 is not read whole


def test_an_old_file_without_a_source_reads_its_notebook_whole(scopes):
    notebooks, sources, _ = _scope(_body(scope="document", course_ids=[1], document_ids=[9]))
    assert notebooks == ["notebook:c1", "notebook:c3"] and sources is None


def test_whole_notebooks_with_courses_stay_whole(scopes):
    notebooks, sources, label = _scope(_body(scope="notebook", course_ids=[3], notebook_ids=["notebook:s1"]))
    assert notebooks == ["notebook:c3", "notebook:s1"] and sources is None
    assert label == "แหล่งความรู้ที่เลือก 2 แหล่ง"


def test_single_picks_alone_keep_the_old_path(scopes):
    _scope(_body(scope="document", document_ids=[7]))
    assert scopes.get("old_pick") is True


def test_nothing_picked_is_refused(scopes):
    from fastapi import HTTPException

    with pytest.raises(HTTPException):
        _scope(_body(scope="document"))


def test_empty_libraries_are_refused(scopes, monkeypatch):
    from fastapi import HTTPException

    async def nothing(user, scope, course_id=None, document_ids=None):
        return []

    monkeypatch.setattr(router.library, "notebook_ids_for_scope", nothing)
    with pytest.raises(HTTPException) as exc:
        _scope(_body(scope="document", include_personal=True))
    assert exc.value.status_code == 400


def test_only_single_files_skip_the_similarity_floor():
    assert router._files_only({"document_ids": [1]}) is True
    assert router._files_only({"document_ids": [1], "course_ids": [2]}) is False
    assert router._files_only({"source_ids": ["s"], "notebook_ids": ["n"]}) is False
    assert router._files_only({"include_personal": True}) is False
    assert router._files_only({}) is False
    assert router._files_only(_body(document_ids=[1])) is True


def test_generate_plan_uses_the_given_flag_not_the_source_list(monkeypatch):
    seen = []

    async def fake_retrieve(*a, **k):
        return [{"id": "source:x", "title": "t", "snippet": "s", "score": 0.01, "index": 1}]

    def spy(found, *, picked):
        seen.append(picked)
        raise RuntimeError("stop")

    monkeypatch.setattr(roadmap_plan.rag, "retrieve", fake_retrieve)
    monkeypatch.setattr(roadmap_plan, "relevant_passages", spy)
    with pytest.raises(RuntimeError):
        asyncio.run(roadmap_plan.generate_plan(owner_id="1", description="Python", notebook_ids=["notebook:c1"],
                                               source_ids=["source:a", "source:c1a"], files_only=False))
    assert seen == [False]


def test_document_lookup_takes_fifty():
    from siet_platform import library

    assert library.MAX_PICKED_SOURCES == 50
    import inspect

    assert "[:MAX_PICKED_SOURCES]" in inspect.getsource(library.list_documents_by_ids)


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


def test_the_quiz_keeps_its_own_scope_path(scopes):
    body = router.StudyQuizBody(**{**{k: v for k, v in {"notebook_ids": ["notebook:s1"], "document_ids": [7]}.items()},
                                   **_quiz_required()})
    _scope(body)
    assert scopes.get("old_pick") is True


def _quiz_required():
    fields = router.StudyQuizBody.model_fields
    return {name: ("x" if f.annotation is str else 5) for name, f in fields.items() if f.is_required()}
