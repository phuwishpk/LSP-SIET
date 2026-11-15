"""AI quiz generation: the three question types and difficulty (what the model may read: platform/tests-platform/test_ai_helpers.py)."""

import asyncio

import pytest

from siet_quiz import service
from siet_core.exceptions import ExternalServiceError, InvalidInputError


def _mcq(**extra):
    return {
        "type": "mcq",
        "question": "Mutex ใช้ทำอะไร",
        "options": [{"text": "ล็อก critical section"}, {"text": "จัดตาราง CPU"}, {"text": "จองหน่วยความจำ"}, {"text": "ส่งข้อความ"}],
        "correct_answer": "ล็อก critical section",
        "explanation": "ให้เธรดเดียวเข้าถึงในเวลาหนึ่ง",
        **extra,
    }


def _fill(**extra):
    return {
        "type": "fill",
        "question": "โปรโตคอลส่งอีเมลคือ ____",
        "correct_answer": "SMTP",
        "acceptable_answers": ["smtp", "Simple Mail Transfer Protocol"],
        "explanation": "SMTP ใช้ส่งอีเมล",
        **extra,
    }


def _matching(**extra):
    return {
        "type": "matching",
        "question": "จับคู่หน่วยความจำกับคุณสมบัติ",
        "pairs": [{"left": "Register", "right": "เร็วที่สุด"}, {"left": "RAM", "right": "หน่วยความจำหลัก"}, {"left": "SSD", "right": "ไม่ลบเลือน"}],
        "explanation": "ลำดับชั้นหน่วยความจำ",
        **extra,
    }


def test_each_type_is_cleaned_into_one_shape():
    clean = service._enforce_quiz_invariants({"questions": [_mcq(), _fill(), _matching()]}, "mixed")
    mcq, fill, matching = clean["questions"]
    assert [q["id"] for q in clean["questions"]] == [1, 2, 3]
    assert mcq["type"] == "mcq" and mcq["correct_answer"] == "ล็อก critical section"
    assert [o["is_correct"] for o in mcq["options"]] == [True, False, False, False]
    assert fill["question"] == "โปรโตคอลส่งอีเมลคือ [___]"  # any blank becomes [___]
    assert fill["acceptable_answers"] == ["SMTP", "Simple Mail Transfer Protocol"]  # deduped, answer first
    assert fill["options"] == []
    assert matching["pairs"][0] == {"left": "Register", "right": "เร็วที่สุด"} and matching["options"] == []


def test_a_letter_answer_points_at_its_option():
    q = service._enforce_quiz_invariants({"questions": [_mcq(correct_answer="B")]})["questions"][0]
    assert q["correct_answer"] == "จัดตาราง CPU"


def test_malformed_or_unrequested_questions_are_dropped_not_fatal():
    raw = {
        "questions": [
            _mcq(options=["ก", "ข", "ค"]),  # three options
            _mcq(correct_answer="ไม่มีในตัวเลือก"),
            _mcq(options=["ก", "ก", "ข", "ค"], correct_answer="ก"),  # repeated option
            _fill(),  # not what was asked
            _mcq(),
        ]
    }
    clean = service._enforce_quiz_invariants(raw, "mcq")
    assert len(clean["questions"]) == 1 and clean["questions"][0]["id"] == 1

    bad_fill = _fill(question="ทั้ง ____ และ ____", correct_answer="SMTP")
    bad_match = _matching(pairs=[{"left": "RAM", "right": "หลัก"}])
    with pytest.raises(ExternalServiceError):
        service._enforce_quiz_invariants({"questions": [bad_fill, bad_match]}, "mixed")


def test_untyped_questions_are_recognised_and_trimmed_to_the_count():
    untyped = [
        {k: v for k, v in _matching().items() if k != "type"},
        {k: v for k, v in _mcq().items() if k != "type"},
        {k: v for k, v in _fill().items() if k != "type"},
    ]
    clean = service._enforce_quiz_invariants({"questions": untyped}, "mixed", question_count=2)
    assert [q["type"] for q in clean["questions"]] == ["matching", "mcq"]


def test_the_prompt_carries_difficulty_type_and_the_no_giveaway_rule():
    prompt = service._quiz_prompt("Deadlock", 5, "th", "hard", "fill", "")
    assert "hard - analysis" in prompt and 'type "fill"' in prompt and "give the answer away" in prompt
    assert "retrieved course documents" not in prompt
    assert "PASSAGE" in service._quiz_prompt("Deadlock", 5, "th", "easy", "mixed", "PASSAGE")


def test_unknown_difficulty_or_type_is_refused():
    with pytest.raises(InvalidInputError):
        asyncio.run(service.generate_quiz(owner_id="u1", topic="OS", difficulty="extreme"))
    with pytest.raises(InvalidInputError):
        asyncio.run(service.generate_quiz(owner_id="u1", topic="OS", question_type="essay"))
