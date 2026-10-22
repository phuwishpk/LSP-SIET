"""
What kmitl-rag plugs into open-notebook's extension points
(open_notebook.extensions; the call sites are listed in docs/UPSTREAM.md).

* chat.context            notebook chat: pin the notebook passages that match
                          the question ahead of the user-selected context
* chat.message            every chat (notebook, source, global): drop URLs the
                          model invented, flag course codes not in the context
* chat.model              notebook chat on Gemini: Google Search grounding
* source_chat.*           source chat: pinned passages, 200k-char full text
"""

from typing import Any, Dict, Optional, Union

from open_notebook import extensions


def register() -> None:
    from kmitl_rag import chat_filters, source_chat

    extensions.add_filter("chat.context", _pin_excerpts)
    extensions.add_filter("chat.message", _filter_message)
    extensions.add_filter("chat.model", chat_filters.enable_google_search)
    extensions.add_filter("source_chat.prompt_data", source_chat.pin_relevant_chunks)
    extensions.add_filter("source_chat.full_text_limit", source_chat.full_text_limit)


async def _pin_excerpts(
    context: Optional[Dict[str, Any]], *, notebook: Any = None, message: str = ""
) -> Dict[str, Any]:
    from kmitl_rag.chat_filters import _pin_relevant_excerpts

    return await _pin_relevant_excerpts(
        context or {}, notebook.id if notebook else None, message
    )


async def _filter_message(
    content: Any, *, message: Any = None, context: Union[Dict[str, Any], str, None] = None
) -> Any:
    """
    Notebook and global chat keep the context as a dict and always filter.
    Source chat keeps the formatted prompt text: wrapped as one source for the
    verbatim checks, and left alone when there is none.
    """
    from kmitl_rag.chat_filters import _filter_url_citations, _verify_course_codes

    if getattr(message, "type", None) != "ai" or not isinstance(content, str):
        return content
    if isinstance(context, str):
        if not context:
            return content
        context = {"sources": [{"full_text": context}]}
    context = context or {}
    content = _filter_url_citations(content, context)
    return await _verify_course_codes(content, context)
