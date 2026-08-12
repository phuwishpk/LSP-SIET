import asyncio
import sqlite3
from typing import Annotated, Any, Dict, List, Optional

from ai_prompter import Prompter
from langchain_core.messages import AIMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from loguru import logger
from typing_extensions import TypedDict

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.config import LANGGRAPH_CHECKPOINT_FILE
from open_notebook.database.repository import ensure_record_id, repo_query
from open_notebook.domain.notebook import Source, SourceInsight
from open_notebook.exceptions import OpenNotebookError
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.context_builder import ContextBuilder
from open_notebook.utils.embedding import generate_embedding
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content


class SourceChatState(TypedDict):
    messages: Annotated[list, add_messages]
    source_id: str
    source: Optional[Source]
    insights: Optional[List[SourceInsight]]
    context: Optional[str]
    model_override: Optional[str]
    context_indicators: Optional[Dict[str, List[str]]]


def _fetch_relevant_chunks(source_id: str, query: str, k: int = 6) -> List[Dict[str, Any]]:
    """
    Semantic-search over the source's embedded chunks for the user's latest
    question. Returns dicts of {content, similarity}. Runs in its own event
    loop because this graph node is sync.
    """
    if not source_id or not (query and query.strip()):
        return []

    async def _run() -> List[Dict[str, Any]]:
        try:
            embed = await generate_embedding(query)
        except Exception as exc:
            logger.warning(f"source_chat: embedding failed: {exc}")
            return []
        # Over-fetch (k * 6) so heavy chunk duplication in this DB (each
        # chunk appears ~3x from repeated embedding runs) doesn't starve the
        # top-k of actually unique passages. We then dedupe in Python before
        # truncating to k. Without this, LIMIT k returns the same passage
        # over and over and the model never sees the second-most-relevant
        # material — which was the bug for "ปีที่ 1 ภาคการศึกษาที่ 2".
        try:
            rows = await repo_query(
                """
                SELECT content,
                       vector::similarity::cosine(embedding, $q) AS sim
                FROM source_embedding
                WHERE source = $source
                  AND vector::similarity::cosine(embedding, $q) >= $min_sim
                ORDER BY sim DESC
                LIMIT $limit
                """,
                {
                    "q": embed,
                    "source": ensure_record_id(source_id),
                    "min_sim": 0.2,
                    "limit": max(k * 6, 30),
                },
            )
        except Exception as exc:
            logger.warning(f"source_chat: vector search failed: {exc}")
            return []
        seen: set = set()
        out: List[Dict[str, Any]] = []
        for row in rows or []:
            text = str(row.get("content") or "")
            if not text:
                continue
            key = text[:120]
            if key in seen:
                continue
            seen.add(key)
            out.append(
                {"text": text[:1500], "similarity": float(row.get("sim") or 0.0)}
            )
            if len(out) >= k:
                break
        return out

    new_loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(new_loop)
        return new_loop.run_until_complete(_run())
    finally:
        new_loop.close()
        asyncio.set_event_loop(None)


def call_model_with_source_context(
    state: SourceChatState, config: RunnableConfig
) -> dict:
    """
    Main function that builds source context and calls the model.

    This function:
    1. Uses ContextBuilder to build source-specific context
    2. Applies the source_chat Jinja2 prompt template
    3. Handles model provisioning with override support
    4. Tracks context indicators for referenced insights/content
    """
    try:
        return _call_model_with_source_context_inner(state, config)
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, user_message = classify_error(e)
        raise error_class(user_message) from e


def _call_model_with_source_context_inner(
    state: SourceChatState, config: RunnableConfig
) -> dict:
    source_id = state.get("source_id")
    if not source_id:
        raise ValueError("source_id is required in state")

    # Build source context using ContextBuilder (run async code in new loop)
    def build_context():
        """Build context in a new event loop"""
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            context_builder = ContextBuilder(
                source_id=source_id,
                include_insights=True,
                include_notes=False,  # Focus on source-specific content
                max_tokens=50000,  # Reasonable limit for source context
            )
            return new_loop.run_until_complete(context_builder.build())
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    # Get the built context
    try:
        # Try to get the current event loop
        asyncio.get_running_loop()
        # If we're in an event loop, run in a thread with a new loop
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(build_context)
            context_data = future.result()
    except RuntimeError:
        # No event loop running, safe to create a new one
        context_data = build_context()

    # Extract source and insights from context
    source = None
    insights = []
    context_indicators: dict[str, list[str | None]] = {
        "sources": [],
        "insights": [],
        "notes": [],
    }

    if context_data.get("sources"):
        source_info = context_data["sources"][0]  # First source
        source = Source(**source_info) if isinstance(source_info, dict) else source_info
        context_indicators["sources"].append(source.id)

    if context_data.get("insights"):
        for insight_data in context_data["insights"]:
            insight = (
                SourceInsight(**insight_data)
                if isinstance(insight_data, dict)
                else insight_data
            )
            insights.append(insight)
            context_indicators["insights"].append(insight.id)

    # Pin the top-k semantic-search chunks for the user's most recent question.
    # Necessary because _format_source_context caps full_text at ~50k chars and
    # the answer may live deeper in the document (e.g. section 3.3.3).
    latest_user_msg = ""
    for m in reversed(state.get("messages", []) or []):
        role = getattr(m, "type", None)
        if role in {"human", "user"}:
            latest_user_msg = getattr(m, "content", "") or ""
            break
    try:
        relevant_chunks = _fetch_relevant_chunks(source_id, str(latest_user_msg))
    except Exception as exc:
        logger.warning(f"source_chat: skipping chunk pinning: {exc}")
        relevant_chunks = []
    if relevant_chunks:
        logger.info(
            f"source_chat: pinned {len(relevant_chunks)} chunk(s) for source {source_id}"
        )

    # Format context for the prompt
    formatted_context = _format_source_context(context_data, relevant_chunks)

    # Build prompt data for the template
    prompt_data = {
        "source": source.model_dump() if source else None,
        "insights": [insight.model_dump() for insight in insights] if insights else [],
        "context": formatted_context,
        "relevant_chunks": relevant_chunks,
        "context_indicators": context_indicators,
    }

    # Apply the source_chat prompt template
    system_prompt = Prompter(prompt_template="source_chat/system").render(
        data=prompt_data
    )
    payload = [SystemMessage(content=system_prompt)] + state.get("messages", [])

    # Handle async model provisioning from sync context
    def run_in_new_loop():
        """Run the async function in a new event loop"""
        new_loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(new_loop)
            return new_loop.run_until_complete(
                provision_langchain_model(
                    str(payload),
                    config.get("configurable", {}).get("model_id")
                    or state.get("model_override"),
                    "chat",
                    max_tokens=8192,
                )
            )
        finally:
            new_loop.close()
            asyncio.set_event_loop(None)

    try:
        # Try to get the current event loop
        asyncio.get_running_loop()
        # If we're in an event loop, run in a thread with a new loop
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(run_in_new_loop)
            model = future.result()
    except RuntimeError:
        # No event loop running, safe to use asyncio.run()
        model = asyncio.run(
            provision_langchain_model(
                str(payload),
                config.get("configurable", {}).get("model_id")
                or state.get("model_override"),
                "chat",
                max_tokens=8192,
            )
        )

    ai_message = model.invoke(payload)

    # Clean thinking content from AI response (e.g., <think>...</think> tags)
    content = extract_text_content(ai_message.content)
    cleaned_content = clean_thinking_content(content)
    cleaned_message = ai_message.model_copy(update={"content": cleaned_content})

    # Update state with context information
    return {
        "messages": cleaned_message,
        "source": source,
        "insights": insights,
        "context": formatted_context,
        "context_indicators": context_indicators,
    }


def _format_source_context(
    context_data: Dict, relevant_chunks: Optional[List[Dict[str, Any]]] = None
) -> str:
    """
    Format the context data into a readable string for the prompt.

    Args:
        context_data: Context data from ContextBuilder
        relevant_chunks: Semantic-search matches for the user's question,
            rendered at the top so the model sees the most relevant passages
            first (mirrors the RELEVANT_EXCERPTS block in the global chat).

    Returns:
        Formatted context string
    """
    context_parts = []

    # Pinned semantic-search chunks first — highest priority for the model.
    if relevant_chunks:
        context_parts.append("## RELEVANT_EXCERPTS")
        context_parts.append(
            "These are the top passages from the source that a semantic search "
            "matched against the user's current question. Prefer these excerpts "
            "as your primary source and quote them verbatim when stating "
            "specifics (course codes, credit counts, program names, etc.)."
        )
        for i, chunk in enumerate(relevant_chunks, 1):
            sim = chunk.get("similarity", 0.0)
            text = chunk.get("text", "")
            context_parts.append(f"### Excerpt {i} (similarity: {sim:.2f})")
            context_parts.append(text)
            context_parts.append("")

    # Add source information
    if context_data.get("sources"):
        context_parts.append("## SOURCE CONTENT")
        for source in context_data["sources"]:
            if isinstance(source, dict):
                context_parts.append(f"**Source ID:** {source.get('id', 'Unknown')}")
                context_parts.append(f"**Title:** {source.get('title', 'No title')}")
                if source.get("full_text"):
                    # Keep the whole document when it fits; Gemini/Claude/GPT
                    # models used here all have >=200k token windows so a 200k
                    # cap trades a little safety margin for full coverage.
                    # Previous cap of 5k chopped 97% of the document off and
                    # caused "section not found" hallucinations.
                    full_text = source["full_text"]
                    if len(full_text) > 200000:
                        full_text = full_text[:200000] + "...\n[Content truncated]"
                    context_parts.append(f"**Content:**\n{full_text}")
                context_parts.append("")  # Empty line for separation

    # Add insights
    if context_data.get("insights"):
        context_parts.append("## SOURCE INSIGHTS")
        for insight in context_data["insights"]:
            if isinstance(insight, dict):
                context_parts.append(f"**Insight ID:** {insight.get('id', 'Unknown')}")
                context_parts.append(
                    f"**Type:** {insight.get('insight_type', 'Unknown')}"
                )
                context_parts.append(
                    f"**Content:** {insight.get('content', 'No content')}"
                )
                context_parts.append("")  # Empty line for separation

    # Add metadata
    if context_data.get("metadata"):
        metadata = context_data["metadata"]
        context_parts.append("## CONTEXT METADATA")
        context_parts.append(f"- Source count: {metadata.get('source_count', 0)}")
        context_parts.append(f"- Insight count: {metadata.get('insight_count', 0)}")
        context_parts.append(f"- Total tokens: {context_data.get('total_tokens', 0)}")
        context_parts.append("")

    return "\n".join(context_parts)


# Create SQLite checkpointer
conn = sqlite3.connect(
    LANGGRAPH_CHECKPOINT_FILE,
    check_same_thread=False,
)
memory = SqliteSaver(conn)

# Create the StateGraph
source_chat_state = StateGraph(SourceChatState)
source_chat_state.add_node("source_chat_agent", call_model_with_source_context)
source_chat_state.add_edge(START, "source_chat_agent")
source_chat_state.add_edge("source_chat_agent", END)
source_chat_graph = source_chat_state.compile(checkpointer=memory)
