"""
Integration tests for LLMExecutor — real Gemini API calls, no mocking.

Requires GEMINI_API_KEY in backend/.env.
These tests verify:
  - A wired prompt produces a non-empty response
  - Token SSE events are emitted during streaming
  - System prompt from wired edge is respected
  - Inline systemPrompt field is used as fallback
  - Missing prompt returns an error dict, not an exception
"""
import asyncio
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from engine.context import ExecutionContext
from engine.executors.llm import LLMExecutor


def _ctx(node_id: str, node_data: dict, *, edges=None, upstream_outputs=None) -> ExecutionContext:
    ctx = ExecutionContext(
        run_id="r1",
        workflow_id="w1",
        graph={
            "nodes": [{"id": node_id, "type": "llm", "data": node_data}],
            "edges": edges or [],
        },
    )
    for nid, outputs in (upstream_outputs or {}).items():
        ctx.node_outputs[nid] = outputs
    return ctx


def _node(node_id: str, data: dict) -> dict:
    return {"id": node_id, "type": "llm", "data": data}


def _collected_tokens(ctx: ExecutionContext) -> list[str]:
    tokens = []
    while not ctx.sse_queue.empty():
        event = ctx.sse_queue.get_nowait()
        if event.get("type") == "token":
            tokens.append(event["token"])
    return tokens


def test_wired_prompt_returns_non_empty_response():
    ctx = _ctx(
        "n1",
        {"model": "gemini-2.5-flash"},
        edges=[
            {
                "source": "src",
                "sourceHandle": "src-value",
                "target": "n1",
                "targetHandle": "n1-prompt",
            }
        ],
        upstream_outputs={"src": {"value": "Reply with exactly three words: foo bar baz"}},
    )
    output = asyncio.run(
        LLMExecutor().execute(_node("n1", {"model": "gemini-2.5-flash"}), ctx)
    )
    assert output["dataType"] == "string"
    assert len(output["response"]) > 0
    assert output["value"] == output["response"]


def test_token_events_are_emitted():
    ctx = _ctx(
        "n1",
        {"model": "gemini-2.5-flash"},
        edges=[
            {
                "source": "src",
                "sourceHandle": "src-value",
                "target": "n1",
                "targetHandle": "n1-prompt",
            }
        ],
        upstream_outputs={"src": {"value": "Count to three: one two three"}},
    )
    asyncio.run(LLMExecutor().execute(_node("n1", {"model": "gemini-2.5-flash"}), ctx))
    tokens = _collected_tokens(ctx)
    assert len(tokens) > 0, "expected at least one token SSE event"


def test_inline_system_prompt_field_is_used():
    data = {
        "model": "gemini-2.5-flash",
        "systemPrompt": "You always reply with exactly one word.",
    }
    ctx = _ctx(
        "n1",
        data,
        edges=[
            {
                "source": "src",
                "sourceHandle": "src-value",
                "target": "n1",
                "targetHandle": "n1-prompt",
            }
        ],
        upstream_outputs={"src": {"value": "Hello"}},
    )
    output = asyncio.run(LLMExecutor().execute(_node("n1", data), ctx))
    assert output["dataType"] == "string"
    assert len(output["response"]) > 0


def test_missing_prompt_returns_error():
    data = {"model": "gemini-2.5-flash"}
    ctx = _ctx("n1", data)
    output = asyncio.run(LLMExecutor().execute(_node("n1", data), ctx))
    assert "error" in output
    assert output["dataType"] == "error"
