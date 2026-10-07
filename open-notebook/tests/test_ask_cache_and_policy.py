"""Answer-cache key and the per-user ask policy."""

from open_notebook.community import ratelimit
from open_notebook.community.ask import answer_cache_key


def key(**over):
    base = dict(question="สรุป สไลด์  สัปดาห์นี้", notebook_ids=["notebook:b", "notebook:a"], source_ids=None,
                allow_global_fallback=False, web="auto", language="th", model_id=None)
    base.update(over)
    return answer_cache_key(**base)


def test_same_question_same_scope_same_key_regardless_of_spacing_case_or_order():
    assert key() == key(question="  สรุป สไลด์ สัปดาห์นี้ ", notebook_ids=["notebook:a", "notebook:b"])
    assert key(question="Summary") == key(question="summary")


def test_anything_that_changes_the_answer_changes_the_key():
    base = key()
    assert key(question="สรุปสไลด์สัปดาห์หน้า") != base
    assert key(notebook_ids=["notebook:a"]) != base
    assert key(source_ids=["source:x"]) != base
    assert key(source_ids=[]) != key(source_ids=None)  # a pick vs a whole scope
    assert key(web="off") != base
    assert key(language="en") != base
    assert key(model_id="model:other") != base
    assert key(allow_global_fallback=True) != base


def test_key_is_namespaced_and_opaque():
    assert key().startswith("rag:answer:v1:") and len(key()) == len("rag:answer:v1:") + 40


def test_ask_policy_counts_stored_questions_of_the_caller():
    ask = ratelimit.LIMITS["ask"]
    assert "rag_messages" in ask.table and "rag_conversations" in ask.table
    assert ask.user_column == "c.user_id" and ask.time_column == "m.created_at"
    assert "m.role = 'user'" in ask.extra_where
    assert ask.cooldown_seconds >= 1 and ask.per_minute >= 1 and ask.per_hour >= ask.per_minute
    # existing policies are untouched by the new fields
    assert ratelimit.LIMITS["post"].per_minute == 0 and ratelimit.LIMITS["post"].time_column == "created_at"
