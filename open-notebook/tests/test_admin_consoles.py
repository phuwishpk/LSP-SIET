"""
Admin consoles for the community, quizzes and KMITL RAG AI.

The queries themselves need MariaDB; these are the pure pieces around them: how
stored RAG answers are folded into statistics, how a calendar day is cut for the
viewer, and how a quiz copied from the feed is told apart from an original.
"""

import json
from datetime import datetime, timedelta, timezone

import pytest

from api.routers.admin import _quiz_origin, _viewer_day, _viewer_window
from open_notebook.community.repository import _naive_utc, _pct, summarize_rag_answers

BANGKOK = 7 * 60


def _answer(coverage="full", cited=(), **extra):
    return json.dumps(
        {
            "coverage": coverage,
            "citations": [{"id": doc, "title": f"เอกสาร {doc}", "cited": True} for doc in cited],
            **extra,
        },
        ensure_ascii=False,
    )


# ------------------------------------------------------------------ RAG answers


def test_coverage_is_counted_per_answer():
    summary = summarize_rag_answers([_answer("full"), _answer("partial"), _answer("none"), _answer("full")])
    assert summary["answers"] == 4
    assert summary["coverage"] == {"full": 2, "partial": 1, "none": 1, "unknown": 0}


@pytest.mark.parametrize("raw", [None, "", "not json", "[]", "42", json.dumps({"coverage": "sideways"})])
def test_an_unreadable_answer_is_unknown_not_an_error(raw):
    summary = summarize_rag_answers([raw])
    assert summary["answers"] == 1
    assert summary["coverage"]["unknown"] == 1


def test_web_and_cache_flags():
    summary = summarize_rag_answers(
        [
            _answer(web_used=True),
            # older rows have the sources but not the flag
            _answer(web_sources=[{"url": "https://example.com"}]),
            _answer(cached=True),
            _answer(web_used=False, web_sources=[], cached=False),
        ]
    )
    assert summary["web_used"] == 2
    assert summary["cached"] == 1


def test_documents_are_ranked_by_the_answers_that_cite_them():
    summary = summarize_rag_answers(
        [
            _answer(cited=["source:a", "source:b"]),
            _answer(cited=["source:a"]),
            _answer(cited=["source:a", "source:c"]),
        ]
    )
    assert [(d["id"], d["count"]) for d in summary["top_documents"]] == [
        ("source:a", 3),
        ("source:b", 1),
        ("source:c", 1),
    ]


def test_a_document_cited_twice_in_one_answer_counts_once():
    meta = json.dumps(
        {
            "coverage": "full",
            "citations": [
                {"id": "source:a", "title": "A", "cited": True},
                {"id": "source:a", "title": "A", "cited": True},
                # retrieved but not used in the answer
                {"id": "source:b", "title": "B", "cited": False},
            ],
        }
    )
    assert summarize_rag_answers([meta])["top_documents"] == [{"id": "source:a", "title": "A", "count": 1}]


def test_an_already_decoded_meta_is_accepted():
    assert summarize_rag_answers([{"coverage": "partial"}])["coverage"]["partial"] == 1


def test_no_answers():
    summary = summarize_rag_answers([])
    assert summary["answers"] == 0 and summary["top_documents"] == []


# ------------------------------------------------------------------ small helpers


@pytest.mark.parametrize("ratio, expected", [(None, None), (0, 0), (0.5, 50), (0.666, 67), (1, 100)])
def test_pct(ratio, expected):
    assert _pct(ratio) == expected


def test_naive_utc_converts_aware_times_and_keeps_naive_ones():
    aware = datetime(2026, 10, 8, 0, 0, tzinfo=timezone(timedelta(hours=7)))
    assert _naive_utc(aware) == datetime(2026, 10, 7, 17, 0)
    naive = datetime(2026, 10, 7, 17, 0)
    assert _naive_utc(naive) is naive


@pytest.mark.parametrize(
    "marker, expected",
    [
        ("import:42", ("imported", 42)),
        ("import:abc", ("imported", None)),
        ("9f2c0d", ("own", None)),
        ("", ("own", None)),
        (None, ("own", None)),
        # a roadmap marker means nothing for a quiz
        ("follow:7", ("own", None)),
    ],
)
def test_quiz_origin(marker, expected):
    assert _quiz_origin(marker) == expected


# ------------------------------------------------------------------ the viewer's days


def test_window_starts_at_the_viewers_midnight():
    since, zone = _viewer_window(days=7, tz_offset=BANGKOK)
    local = since.astimezone(zone)
    assert (local.hour, local.minute, local.second) == (0, 0, 0)
    today = datetime.now(zone).date()
    assert local.date() == today - timedelta(days=6)
    assert since.tzinfo == timezone.utc


def test_one_day_window_is_today():
    since, zone = _viewer_window(days=1, tz_offset=BANGKOK)
    assert since.astimezone(zone).date() == datetime.now(zone).date()


def test_a_late_evening_utc_timestamp_belongs_to_the_next_day_in_bangkok():
    zone = timezone(timedelta(minutes=BANGKOK))
    assert _viewer_day(datetime(2026, 10, 7, 17, 30, tzinfo=timezone.utc), zone) == "2026-10-08"
    # SurrealDB may hand back a naive value: it is UTC
    assert _viewer_day(datetime(2026, 10, 7, 16, 59), zone) == "2026-10-07"
    assert _viewer_day(None, zone) is None
    assert _viewer_day("2026-10-07", zone) is None
