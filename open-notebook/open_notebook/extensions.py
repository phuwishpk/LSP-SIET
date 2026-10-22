"""
Extension points for code that lives outside open-notebook.

A distribution announces an extension in the ``open_notebook.extensions``
entry point group, naming a module that may define:

    ORDER: int                  load order, lower first (default 100)
    register() -> None          add hooks; runs once per process, the worker included
    install(app) -> None        routers and middleware, before open-notebook's own
    finalize(app) -> None       after open-notebook's routers and exception handlers

Upstream files call the functions below at a few documented places
(docs/UPSTREAM.md, "hook points"). With no extension installed every call is a
no-op and open-notebook behaves like upstream.

Hook kinds:

* events     ``on(name, fn)`` / ``await emit(name, **payload)``: notifications
             after something changed; a failing handler is logged, never raised,
             unless it was added with ``critical=True`` (e.g. a migration).
* filters    ``add_filter(name, fn)`` / ``apply_filters[_sync](name, value, **ctx)``:
             each handler returns the (possibly changed) value.
* caches     ``add_cache(name, get, set)`` / ``cache_get`` / ``cache_set``:
             a miss, an error or no cache at all all read as ``None``.
* provider   ``set_provider_gate(fn)`` / ``await call_provider(kind, call, **meta)``:
             wraps every AI provider call (queueing, retries, usage records).
* auth       ``set_auth_backend(obj)`` / ``auth_backend()``: replaces the
             password check of ``api.auth.PasswordAuthMiddleware``.
"""

from __future__ import annotations

import inspect
from importlib.metadata import entry_points
from typing import Any, Awaitable, Callable, Dict, List, Optional, Tuple

from loguru import logger

ENTRY_POINT_GROUP = "open_notebook.extensions"

_loaded: Optional[List[Any]] = None
_events: Dict[str, List[Tuple[Callable[..., Any], bool]]] = {}
_filters: Dict[str, List[Callable[..., Any]]] = {}
_caches: Dict[str, Tuple[Callable[..., Any], Callable[..., Any]]] = {}
_provider_gate: Optional[Callable[..., Awaitable[Any]]] = None
_final_error_checks: List[Callable[[BaseException], bool]] = []
_auth_backend: Any = None


def extensions() -> List[Any]:
    """The installed extension modules in load order, registering them on first use."""
    global _loaded
    if _loaded is None:
        _loaded = []
        found = []
        for ep in entry_points(group=ENTRY_POINT_GROUP):
            module = ep.load()
            found.append((getattr(module, "ORDER", 100), ep.name, module))
        for _order, name, module in sorted(found, key=lambda item: (item[0], item[1])):
            register = getattr(module, "register", None)
            if register is not None:
                register()
            _loaded.append(module)
            logger.debug(f"open-notebook extension loaded: {name}")
    return _loaded


def install_app(app: Any) -> None:
    for module in extensions():
        install = getattr(module, "install", None)
        if install is not None:
            install(app)


def finalize_app(app: Any) -> None:
    for module in extensions():
        finalize = getattr(module, "finalize", None)
        if finalize is not None:
            finalize(app)


# ---------------------------------------------------------------------------
# events
# ---------------------------------------------------------------------------


def on(name: str, handler: Callable[..., Any], *, critical: bool = False) -> None:
    _events.setdefault(name, []).append((handler, critical))


async def emit(name: str, **payload: Any) -> None:
    extensions()
    for handler, critical in _events.get(name, ()):
        try:
            result = handler(**payload)
            if inspect.isawaitable(result):
                await result
        except Exception as exc:
            if critical:
                raise
            logger.warning(f"extension handler for '{name}' failed: {exc}")


# ---------------------------------------------------------------------------
# filters
# ---------------------------------------------------------------------------


def add_filter(name: str, handler: Callable[..., Any]) -> None:
    _filters.setdefault(name, []).append(handler)


async def apply_filters(name: str, value: Any, **context: Any) -> Any:
    extensions()
    for handler in _filters.get(name, ()):
        value = handler(value, **context)
        if inspect.isawaitable(value):
            value = await value
    return value


def apply_filters_sync(name: str, value: Any, **context: Any) -> Any:
    """For sync code such as LangGraph nodes; the handlers must be sync too."""
    extensions()
    for handler in _filters.get(name, ()):
        value = handler(value, **context)
    return value


# ---------------------------------------------------------------------------
# caches
# ---------------------------------------------------------------------------


def add_cache(
    name: str,
    get: Callable[[Any], Awaitable[Any]],
    set: Callable[[Any, Any], Awaitable[Any]],
) -> None:
    _caches[name] = (get, set)


async def cache_get(name: str, key: Any) -> Any:
    extensions()
    if name not in _caches:
        return None
    try:
        return await _caches[name][0](key)
    except Exception as exc:
        logger.debug(f"cache '{name}' read skipped: {exc}")
        return None


async def cache_set(name: str, key: Any, value: Any) -> None:
    extensions()
    if name not in _caches:
        return
    try:
        await _caches[name][1](key, value)
    except Exception as exc:
        logger.debug(f"cache '{name}' write skipped: {exc}")


# ---------------------------------------------------------------------------
# AI provider calls
# ---------------------------------------------------------------------------


def set_provider_gate(gate: Callable[..., Awaitable[Any]]) -> None:
    global _provider_gate
    _provider_gate = gate


async def call_provider(kind: str, call: Callable[[], Awaitable[Any]], **meta: Any) -> Any:
    """Run ``call()``, through the installed gate when there is one."""
    extensions()
    if _provider_gate is None:
        return await call()
    return await _provider_gate(kind, call, **meta)


def add_final_provider_error(check: Callable[[BaseException], bool]) -> None:
    _final_error_checks.append(check)


def is_final_provider_error(exc: BaseException) -> bool:
    """True when the gate already retried, so the caller must not retry again."""
    extensions()
    return any(check(exc) for check in _final_error_checks)


# ---------------------------------------------------------------------------
# authentication
# ---------------------------------------------------------------------------


def set_auth_backend(backend: Any) -> None:
    global _auth_backend
    _auth_backend = backend


def auth_backend() -> Any:
    extensions()
    return _auth_backend
