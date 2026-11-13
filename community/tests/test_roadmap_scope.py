"""Which knowledge a roadmap request reads."""

import asyncio
from types import SimpleNamespace

from siet_community.routers import community


def test_no_library_means_no_notebooks_and_survives_an_expansion():
    body = community.StudyRoadmapBody(description="อยากเรียน SQL", scope="none")
    user = SimpleNamespace(id=1, role="student")
    assert asyncio.run(community._study_scope(user, body)) == ([], None, "ไม่ใช้คลังความรู้")

    # expansion rebuilds the request from the settings saved with the roadmap
    session = SimpleNamespace(id="roadmap_session:x", settings={"scope": "none", "web": "auto"})
    assert asyncio.run(community._expansion_scope(user, session)) == ([], None)


def test_a_quiz_uses_the_same_knowledge_picker():
    user = SimpleNamespace(id=1, role="student")
    body = community.StudyQuizBody(topic="Deadlock", scope="none", difficulty="hard", question_type="mixed")
    assert asyncio.run(community._study_scope(user, body)) == ([], None, "ไม่ใช้คลังความรู้")


def test_only_multiple_choice_reaches_the_feed():
    import pytest
    from fastapi import HTTPException

    mcq = {"id": 1, "type": "mcq", "question": "Q", "options": [{"text": "a"}], "correct_answer": "a"}
    legacy = {"id": 2, "question": "Q2", "options": [{"text": "b"}], "correct_answer": "b"}  # no type: older sets
    fill = {"id": 3, "type": "fill", "question": "Q3 [___]", "correct_answer": "x", "options": []}
    session = SimpleNamespace(topic="OS", language="th", questions=[mcq, fill, legacy])
    snapshot = community._quiz_snapshot(session)
    assert [q["id"] for q in snapshot["questions"]] == [1, 2] and snapshot["question_count"] == 2

    with pytest.raises(HTTPException) as refused:
        community._quiz_snapshot(SimpleNamespace(topic="OS", language="th", questions=[fill]))
    assert refused.value.status_code == 400
