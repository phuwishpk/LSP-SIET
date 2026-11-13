"""
siet-community as an open-notebook extension (entry point group
``open_notebook.extensions``, see open_notebook/extensions.py).

register()   seeds the demo categories and course rooms with the seed accounts
install()    /community/*, the community part of /admin/*, and
             /features/quiz/generate (same paths as before)
"""

ORDER = 30


def register() -> None:
    from open_notebook import extensions
    from siet_community.catalog import seed_catalog

    extensions.on("siet.seed_demo_data", seed_catalog)


def install(app) -> None:
    from siet_community.routers import admin, community, features

    app.include_router(features.router, prefix="/api", tags=["features"])
    app.include_router(community.router, prefix="/api", tags=["community"])
    app.include_router(admin.router, prefix="/api", tags=["admin"])
