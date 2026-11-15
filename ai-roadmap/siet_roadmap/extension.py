"""
siet-roadmap as an extension (entry point group ``siet.extensions``, see
siet_core/extensions.py).

install()    /features/roadmap/* and DELETE /admin/roadmaps/{id} (same paths as
             before; they were in siet_platform and siet_community)
"""

ORDER = 12


def install(app) -> None:
    from siet_roadmap.routers import admin, features

    app.include_router(features.router, prefix="/api", tags=["features"])
    app.include_router(admin.router, prefix="/api", tags=["admin"])
