"""open_notebook.extensions: the hook registry, and what siet-platform registers in it."""

import pytest

from open_notebook import extensions


@pytest.fixture
def bare(monkeypatch):
    """The registry with nothing installed (as in upstream open-notebook)."""
    monkeypatch.setattr(extensions, "_loaded", [])
    monkeypatch.setattr(extensions, "_events", {})
    monkeypatch.setattr(extensions, "_filters", {})
    monkeypatch.setattr(extensions, "_caches", {})
    monkeypatch.setattr(extensions, "_provider_gate", None)
    monkeypatch.setattr(extensions, "_final_error_checks", [])
    monkeypatch.setattr(extensions, "_auth_backend", None)
    return extensions


@pytest.mark.asyncio
async def test_nothing_installed_means_upstream_behaviour(bare):
    assert await bare.apply_filters("chat.context", {"a": 1}) == {"a": 1}
    assert bare.apply_filters_sync("source_chat.full_text_limit", 5000) == 5000
    assert await bare.cache_get("context", ("nb", None)) is None
    await bare.cache_set("context", ("nb", None), [1])  # no cache: silently nothing
    await bare.emit("notebook.changed", notebook_id="notebook:1")

    async def call():
        return "embedded"

    assert await bare.call_provider("embedding", call) == "embedded"
    assert bare.is_final_provider_error(RuntimeError()) is False
    assert bare.auth_backend() is None


@pytest.mark.asyncio
async def test_events_log_failures_unless_critical(bare):
    seen = []

    async def ok(**payload):
        seen.append(payload)

    def broken(**payload):
        raise RuntimeError("cache down")

    bare.on("source.changed", broken)
    bare.on("source.changed", ok)
    await bare.emit("source.changed", source_id="source:1")
    assert seen == [{"source_id": "source:1"}]

    bare.on("app.startup", broken, critical=True)
    with pytest.raises(RuntimeError):
        await bare.emit("app.startup")


@pytest.mark.asyncio
async def test_filters_chain_in_order_sync_and_async(bare):
    async def double(value, **ctx):
        return value * 2

    bare.add_filter("n", double)
    bare.add_filter("n", lambda value, plus: value + plus)
    assert await bare.apply_filters("n", 3, plus=1) == 7


@pytest.mark.asyncio
async def test_cache_errors_read_as_a_miss(bare):
    async def get(key):
        raise ConnectionError("redis down")

    async def set_(key, value):
        raise ConnectionError("redis down")

    bare.add_cache("vector_search", get, set_)
    assert await bare.cache_get("vector_search", {"q": "x"}) is None
    await bare.cache_set("vector_search", {"q": "x"}, [])


@pytest.mark.asyncio
async def test_provider_gate_wraps_calls(bare):
    calls = []

    async def gate(kind, call, **meta):
        calls.append((kind, meta["label"]))
        return await call()

    async def call():
        return [0.1]

    bare.set_provider_gate(gate)
    bare.add_final_provider_error(lambda exc: isinstance(exc, TimeoutError))
    assert await bare.call_provider("embedding", call, label="embed x1") == [0.1]
    assert calls == [("embedding", "embed x1")]
    assert bare.is_final_provider_error(TimeoutError()) is True


def test_siet_packages_register_their_hooks():
    from siet_platform.auth_backend import WorkspaceAuthBackend

    names = [m.__name__ for m in extensions.extensions()]
    assert names == ["siet_platform.extension", "kmitl_rag.extension", "siet_community.extension"]
    assert isinstance(extensions.auth_backend(), WorkspaceAuthBackend)
    for name in ("source.context", "chat.prompt_data", "chat.context", "chat.message", "chat.model",
                 "source_chat.prompt_data", "source_chat.full_text_limit"):
        assert extensions._filters.get(name), name
    for name in ("vector_search", "context", "provider_availability"):
        assert name in extensions._caches, name
    for name in ("notebook.changed", "source.changed", "models.changed", "app.startup",
                 "app.shutdown", "siet.seed_demo_data"):
        assert extensions._events.get(name), name
    # the k-track migrations must stop the API like the core ones do
    assert any(critical for _handler, critical in extensions._events["app.startup"])


@pytest.mark.asyncio
async def test_source_context_carries_the_asset_url():
    from types import SimpleNamespace

    source = SimpleNamespace(asset=SimpleNamespace(url=None, file_path="/data/a.pdf"))
    out = await extensions.apply_filters("source.context", {"id": "source:1"}, source=source)
    assert out == {"id": "source:1", "asset_url": "/data/a.pdf"}


def test_chat_prompt_gets_todays_date_in_both_calendars():
    data = extensions.apply_filters_sync("chat.prompt_data", {"messages": []})
    assert data["current_year_be"] == data["current_year_ce"] + 543
    assert data["messages"] == []
