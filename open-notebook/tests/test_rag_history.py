"""Chat history for KMITL RAG AI: stored per user, private to its owner."""

import pytest

from open_notebook.community.repository import TITLE_MAX, conversation_title


@pytest.mark.parametrize(
    "question, expected",
    [
        ("หลักสูตรนี้เรียนกี่หน่วยกิต", "หลักสูตรนี้เรียนกี่หน่วยกิต"),
        ("  บรรทัดแรก\nบรรทัดสอง  ", "บรรทัดแรก บรรทัดสอง"),
        ("", "บทสนทนาใหม่"),
        (None, "บทสนทนาใหม่"),
    ],
)
def test_conversation_title(question, expected):
    assert conversation_title(question) == expected


def test_conversation_title_fits_the_column():
    title = conversation_title("ก" * 500)
    assert len(title) <= TITLE_MAX and title.endswith("…")
