"""
siet-platform as an open-notebook extension (entry point group
``open_notebook.extensions``, see open_notebook/extensions.py).

register()   hooks into open-notebook (siet_platform.hooks)
install()    the role gate and the platform routers, ahead of open-notebook's
finalize()   KMITL error envelopes; removes routes the workspace replaces or
             does not offer
"""

import os

ORDER = 10

# Podcasts are upstream code we keep (so syncing upstream stays a clean
# merge) but do not offer. SIET_ENABLE_PODCASTS=1 brings the routes back.
PODCAST_PREFIXES = ("/api/podcasts", "/api/episode-profiles", "/api/speaker-profiles")


def register() -> None:
    from siet_platform import hooks

    hooks.register()


def install(app) -> None:
    from siet_platform.auth_roles import RoleAccessMiddleware
    from siet_platform.routers import admin, cache_admin, features, google_auth, users

    # Added before open-notebook's password middleware so that it *runs after*
    # it (Starlette executes middleware in reverse registration order) and can
    # read the owner id that authentication resolved.
    app.add_middleware(
        RoleAccessMiddleware,
        exempt_paths=["/", "/health", "/docs", "/openapi.json", "/redoc", "/api/config"],
    )
    # users serves /api/auth/status (JWT auth state); it must win over
    # open-notebook's password-only route of the same path (see finalize).
    app.include_router(users.router, prefix="/api", tags=["users"])
    app.include_router(google_auth.router, prefix="/api", tags=["auth"])
    app.include_router(features.router, prefix="/api", tags=["features"])
    app.include_router(admin.router, prefix="/api", tags=["admin"])
    app.include_router(cache_admin.router, prefix="/api", tags=["config"])


def finalize(app) -> None:
    from fastapi import Request
    from fastapi.responses import JSONResponse

    from open_notebook.exceptions import RateLimitError
    from siet_platform.throttle import ProviderBusy

    def cors_headers(request: Request):
        from api.main import _cors_headers

        return _cors_headers(request)

    async def rate_limit_error_handler(request: Request, exc: RateLimitError):
        # The provider kept answering 429 even after the gate's retries: tell the
        # client when to try again instead of leaving it to guess.
        return JSONResponse(
            status_code=429,
            content={"detail": str(exc)},
            headers={**cors_headers(request), "Retry-After": "15", "X-Points-Kind": "provider_rate_limit"},
        )

    async def provider_busy_handler(request: Request, exc: ProviderBusy):
        # Our own queue stayed full for the whole timeout: a temporary overload,
        # not a client fault, so 503 + Retry-After (clients retry automatically).
        return JSONResponse(
            status_code=503,
            content={"detail": str(exc)},
            headers={
                **cors_headers(request),
                "Retry-After": str(exc.retry_after),
                "X-Points-Kind": "llm_busy",
            },
        )

    app.add_exception_handler(RateLimitError, rate_limit_error_handler)
    app.add_exception_handler(ProviderBusy, provider_busy_handler)

    # open-notebook's /api/auth/status only knows the password gate, so it would
    # tell the frontend auth is off while login is JWT-only: keep the one in
    # siet_platform.routers.users. Podcasts stay off unless enabled.
    from api.routers import auth, episode_profiles, podcasts, speaker_profiles

    dropped = [auth.router]
    if os.getenv("SIET_ENABLE_PODCASTS", "").strip().lower() not in {"1", "true", "yes"}:
        dropped += [podcasts.router, episode_profiles.router, speaker_profiles.router]
    dropped_modules = {
        getattr(r.endpoint, "__module__", "") for router in dropped for r in router.routes
    }

    def keep(route) -> bool:
        original = getattr(route, "original_router", None)  # FastAPI >= 0.13x
        if original is not None:
            return all(original is not router for router in dropped)
        return getattr(getattr(route, "endpoint", None), "__module__", "") not in dropped_modules

    app.router.routes[:] = [r for r in app.router.routes if keep(r)]
    mark_changed = getattr(app.router, "_mark_routes_changed", None)
    if mark_changed is not None:
        mark_changed()
