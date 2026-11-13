"""
kmitl-rag as an open-notebook extension (entry point group
``open_notebook.extensions``, see open_notebook/extensions.py).

register()   chat hooks (kmitl_rag.hooks)
install()    /community/knowledge + /community/ask*, /admin/rag/*,
             /search/ask/notebooks and /chat/global/* (same paths as before)
"""

ORDER = 20


def register() -> None:
    from kmitl_rag import hooks

    hooks.register()


def install(app) -> None:
    from kmitl_rag.routers import admin, ask, global_chat, notebook_ask

    app.include_router(notebook_ask.router, prefix="/api", tags=["search"])
    app.include_router(global_chat.router, prefix="/api", tags=["chat"])
    app.include_router(ask.router, prefix="/api", tags=["community"])
    app.include_router(admin.router, prefix="/api", tags=["admin"])
