"""
kmitl-rag as an open-notebook extension (entry point group
``siet.extensions``, see siet_core/extensions.py).

register()   chat hooks (kmitl_rag.hooks)
install()    /community/knowledge + /community/ask*, /admin/rag/*,
             /search/ask/notebooks and /chat/global/* (same paths as before)
finalize()   the notebooks/sources API (notebooks, search, transformations, notes,
             embed, embeddings, sources, insights, chat, source chat), mounted after
             the core's routers, where api/main.py used to include it
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


def finalize(app) -> None:
    from kmitl_rag.routers import (
        chat,
        embedding,
        embedding_rebuild,
        insights,
        notebooks,
        notes,
        search,
        source_chat,
        sources,
        transformations,
    )

    # Same prefixes, tags and relative order as api/main.py had them.
    app.include_router(notebooks.router, prefix="/api", tags=["notebooks"])
    app.include_router(search.router, prefix="/api", tags=["search"])
    app.include_router(transformations.router, prefix="/api", tags=["transformations"])
    app.include_router(notes.router, prefix="/api", tags=["notes"])
    app.include_router(embedding.router, prefix="/api", tags=["embedding"])
    app.include_router(
        embedding_rebuild.router, prefix="/api/embeddings", tags=["embeddings"]
    )
    app.include_router(sources.router, prefix="/api", tags=["sources"])
    app.include_router(insights.router, prefix="/api", tags=["insights"])
    app.include_router(chat.router, prefix="/api", tags=["chat"])
    app.include_router(source_chat.router, prefix="/api", tags=["source-chat"])
