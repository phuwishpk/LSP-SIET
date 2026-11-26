"""Web references: only live pages on kmitl.ac.th, reached without leaving Google/KMITL hosts."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from kmitl_rag import web_verify
from kmitl_rag.web_verify import (
    NOT_FOUND,
    PARTIAL,
    is_kmitl_host,
    rebuild_web_text,
    verify_url,
)

GOOGLE = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"


class Net:
    """Fake network: url -> (status, location); records every fetched url."""

    def __init__(self, routes):
        self.routes = routes
        self.calls: list[str] = []

    async def fetch(self, url):
        self.calls.append(url)
        result = self.routes.get(url)
        if isinstance(result, Exception):
            raise result
        return result if result else (404, None)


async def public(host):
    return ["161.246.34.11"]


class FakeCache:
    def __init__(self):
        self.store = {}

    async def get_json(self, key):
        return self.store.get(key)

    async def set_json(self, key, value, ttl=None):
        self.store[key] = value
        return True


@pytest.fixture(autouse=True)
def cache():
    fake = FakeCache()
    with patch.object(web_verify, "cache_service", fake):
        yield fake


def test_kmitl_hosts():
    assert is_kmitl_host("kmitl.ac.th")
    assert is_kmitl_host("REG.KMITL.AC.TH")
    assert is_kmitl_host("siet.kmitl.ac.th")
    for bad in ("kmitl.ac.th.evil.com", "notkmitl.ac.th", "kmutt.ac.th", "", "kmitl.ac.th:8080"):
        assert not is_kmitl_host(bad)


@pytest.mark.asyncio
async def test_google_redirect_to_live_kmitl_page_returns_final_url():
    net = Net({GOOGLE: (302, "https://www.kmitl.ac.th/about"), "https://www.kmitl.ac.th/about": (200, None)})
    assert await verify_url(GOOGLE, fetch=net.fetch, resolve=public) == "https://www.kmitl.ac.th/about"


@pytest.mark.asyncio
async def test_404_and_timeout_are_dropped():
    net = Net({GOOGLE: (302, "https://www.kmitl.ac.th/gone")})
    assert await verify_url(GOOGLE, fetch=net.fetch, resolve=public) is None
    net = Net({"https://reg.kmitl.ac.th/x": TimeoutError()})
    assert await verify_url("https://reg.kmitl.ac.th/x", fetch=net.fetch, resolve=public) is None


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [403, 429, 401])
async def test_403_and_429_count_as_existing(status):
    net = Net({"https://www.kmitl.ac.th/p": (status, None)})
    assert await verify_url("https://www.kmitl.ac.th/p", fetch=net.fetch, resolve=public) == "https://www.kmitl.ac.th/p"


@pytest.mark.asyncio
async def test_redirect_to_other_host_is_rejected_without_fetching_it():
    net = Net({GOOGLE: (302, "https://blog.example.com/kmitl-fees")})
    assert await verify_url(GOOGLE, fetch=net.fetch, resolve=public) is None
    assert net.calls == [GOOGLE]


@pytest.mark.asyncio
async def test_kmitl_page_redirecting_back_to_google_is_rejected():
    net = Net({"https://www.kmitl.ac.th/a": (302, GOOGLE)})
    assert await verify_url("https://www.kmitl.ac.th/a", fetch=net.fetch, resolve=public) is None
    assert net.calls == ["https://www.kmitl.ac.th/a"]


@pytest.mark.asyncio
async def test_private_ip_and_ip_literal_rejected():
    async def private(host):
        return ["10.0.0.5"]

    net = Net({"https://intranet.kmitl.ac.th/": (200, None)})
    assert await verify_url("https://intranet.kmitl.ac.th/", fetch=net.fetch, resolve=private) is None
    assert await verify_url("http://127.0.0.1/", fetch=net.fetch, resolve=public) is None
    assert await verify_url("ftp://www.kmitl.ac.th/", fetch=net.fetch, resolve=public) is None
    assert net.calls == []


@pytest.mark.asyncio
async def test_more_than_five_hops_rejected():
    routes = {f"https://www.kmitl.ac.th/{i}": (302, f"https://www.kmitl.ac.th/{i + 1}") for i in range(10)}
    net = Net(routes)
    assert await verify_url("https://www.kmitl.ac.th/0", fetch=net.fetch, resolve=public) is None
    assert len(net.calls) <= 6


@pytest.mark.asyncio
async def test_result_is_cached():
    net = Net({"https://www.kmitl.ac.th/c": (200, None)})
    await verify_url("https://www.kmitl.ac.th/c", fetch=net.fetch, resolve=public)
    await verify_url("https://www.kmitl.ac.th/c", fetch=net.fetch, resolve=public)
    assert net.calls == ["https://www.kmitl.ac.th/c"]


TEXT = "สจล. มีนักศึกษาราว 30,000 คน ค่าเทอมประมาณ 25,000 บาท ข้อมูลอื่นไม่มี"
META = {
    "grounding_supports": [
        {"segment": {"text": "สจล. มีนักศึกษาราว 30,000 คน"}, "grounding_chunk_indices": [0, 1]},
        {"segment": {"text": "ค่าเทอมประมาณ 25,000 บาท"}, "grounding_chunk_indices": [1]},
    ]
}
# chunk 0 -> source 1 (dropped blog), chunk 1 -> source 2 (kept kmitl)
CHUNKS = {0: 1, 1: 2}


def test_rebuild_keeps_only_segments_backed_by_kept_sources():
    text, sources, removed = rebuild_web_text(
        TEXT, META, CHUNKS, kept={2: "https://www.kmitl.ac.th/stat"}, titles={2: "kmitl.ac.th"}, language="th"
    )
    assert text.startswith("สจล. มีนักศึกษาราว 30,000 คน [W1]")
    assert "ค่าเทอมประมาณ 25,000 บาท [W1]" in text
    assert "ข้อมูลอื่นไม่มี" not in text
    assert sources == [{"index": 1, "title": "kmitl.ac.th", "url": "https://www.kmitl.ac.th/stat"}]
    assert removed is True


def test_rebuild_adds_partial_line_when_something_was_dropped():
    text, _sources, _removed = rebuild_web_text(
        TEXT, META, CHUNKS, kept={2: "https://www.kmitl.ac.th/stat"}, titles={}, language="th"
    )
    assert text.rstrip().endswith(PARTIAL["th"])


@pytest.mark.parametrize("language", ["th", "en"])
def test_rebuild_nothing_kept_gives_not_found_line(language):
    text, sources, removed = rebuild_web_text(TEXT, META, CHUNKS, kept={}, titles={}, language=language)
    assert text == NOT_FOUND[language] and sources == [] and removed is True


def test_rebuild_ignores_segments_that_are_not_in_the_answer():
    meta = {"grounding_supports": [
        {"segment": {"text": "ข้อความที่ไม่มีในคำตอบ"}, "grounding_chunk_indices": [1]},
        {"segment": {"text": "สจล. มีนักศึกษาราว 30,000 คน"}, "grounding_chunk_indices": [1]},
    ]}
    text, _sources, _removed = rebuild_web_text(
        TEXT, meta, CHUNKS, kept={2: "https://www.kmitl.ac.th/stat"}, titles={}, language="th"
    )
    assert "ข้อความที่ไม่มีในคำตอบ" not in text and "30,000 คน [W1]" in text
