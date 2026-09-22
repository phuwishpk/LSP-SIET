"""
Sharing rules for the community RAG dropdown ("เจาะจงเอกสาร").

Staff research notebooks and live course libraries are readable by every role;
anything a student owns must never leak. These are the pure decision functions —
the database-backed listing builds on them.
"""

import pytest

from open_notebook.community.library import (
    classify_notebook_owner,
    is_valid_record_id,
)

STAFF = {1, 8}
COURSES = {3, 107}


@pytest.mark.parametrize(
    "owner, expected",
    [
        ("1", "staff"),  # admin
        ("8", "staff"),  # teacher
        ("default", "staff"),  # legacy notebook from before per-user ownership
        (None, "staff"),
        ("", "staff"),
        ("course:3", "course"),  # live course library
        ("course:59", None),  # course was deleted -> its library is gone too
        ("course:abc", None),
        ("2", None),  # student
        ("9", None),  # user no longer exists
        ("1; DROP", None),
        ("teacher", None),
    ],
)
def test_classify_notebook_owner(owner, expected):
    assert classify_notebook_owner(owner, staff_ids=STAFF, course_ids=COURSES) == expected


def test_a_demoted_teacher_stops_sharing():
    assert classify_notebook_owner("8", staff_ids={1}, course_ids=COURSES) is None


@pytest.mark.parametrize(
    "value, table, ok",
    [
        ("notebook:imsibidv441yufbsi5x1", "notebook", True),
        ("source:5hw7jdwzzim5pitpq04o", "source", True),
        ("source:abc", "notebook", False),  # right shape, wrong table
        ("notebook:", "notebook", False),
        ("notebook:a b", "notebook", False),
        ("notebook:abc; DELETE notebook", "notebook", False),
        ("users:1", "notebook", False),
        (12, "notebook", False),
        (None, "source", False),
    ],
)
def test_is_valid_record_id(value, table, ok):
    assert is_valid_record_id(value, table) is ok


# ---------------------------------------------------------------- admin sees everything
from types import SimpleNamespace  # noqa: E402

from open_notebook.community.library import classify_private_notebook, is_admin  # noqa: E402


@pytest.mark.parametrize(
    "role, expected", [("admin", True), ("teacher", False), ("student", False), (None, False)]
)
def test_only_an_admin_gets_the_private_notebooks(role, expected):
    assert is_admin(SimpleNamespace(role=role)) is expected
    assert is_admin(None) is False


def test_private_notebooks_are_labelled_by_kind():
    personal = {"notebook:lib1"}
    assert classify_private_notebook("[ส่วนตัว] Student 1", "notebook:x", personal) == "personal"
    assert classify_private_notebook("anything", "notebook:lib1", personal) == "personal"
    assert classify_private_notebook("ห้องที่นักศึกษาสร้างเอง", "notebook:y", personal) == "student"
