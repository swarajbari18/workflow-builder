"""
Tests for ExecutionContext — the shared object threaded through all executors.

Tests cover:
  - get_input resolves an edge correctly
  - get_input returns None when no edge connects to a handle
  - get_input returns None when the upstream node hasn't run yet
  - get_input handles the React Flow handle naming convention correctly
  - get_node_data returns field values for a node
  - emit puts events onto the queue
"""
import asyncio
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine.context import ExecutionContext, _strip_node_prefix


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_graph(nodes=None, edges=None):
    return {"nodes": nodes or [], "edges": edges or []}


def make_edge(source, source_handle_id, target, target_handle_id):
    """Build an edge in React Flow's format."""
    return {
        "id": f"e-{source}-{target}",
        "source": source,
        "sourceHandle": f"{source}-{source_handle_id}",
        "target": target,
        "targetHandle": f"{target}-{target_handle_id}",
        "data": {"dataType": "string"},
    }


def make_ctx(**kwargs):
    return ExecutionContext(run_id="test-run", workflow_id="test-wf", **kwargs)


# ---------------------------------------------------------------------------
# _strip_node_prefix
# ---------------------------------------------------------------------------

def test_strip_node_prefix_normal():
    assert _strip_node_prefix("llm-1-response", "llm-1") == "response"


def test_strip_node_prefix_hyphenated_handle():
    # handle IDs can themselves contain hyphens (e.g. "fn-schema")
    assert _strip_node_prefix("script-1-fn-schema", "script-1") == "fn-schema"


def test_strip_node_prefix_no_match_returns_full():
    # Defensive fallback: if convention breaks, return the full key
    assert _strip_node_prefix("something-weird", "llm-1") == "something-weird"


# ---------------------------------------------------------------------------
# get_input — edge resolution
# ---------------------------------------------------------------------------

def test_get_input_resolves_connected_handle():
    """
    Graph: text-1(output) → llm-1(prompt)
    text-1 has run and produced {"output": "Hello World"}
    ctx.get_input("llm-1", "prompt") should return "Hello World"
    """
    graph = make_graph(
        nodes=[
            {"id": "text-1", "type": "text", "data": {}},
            {"id": "llm-1", "type": "llm", "data": {}},
        ],
        edges=[make_edge("text-1", "output", "llm-1", "prompt")],
    )
    ctx = make_ctx(
        graph=graph,
        node_outputs={"text-1": {"output": "Hello World", "dataType": "string"}},
    )
    result = ctx.get_input("llm-1", "prompt")
    assert result == "Hello World"


def test_get_input_returns_none_when_no_edge():
    """Handle is not wired — get_input must return None, not raise."""
    graph = make_graph(
        nodes=[{"id": "llm-1", "type": "llm", "data": {}}],
        edges=[],
    )
    ctx = make_ctx(graph=graph)
    assert ctx.get_input("llm-1", "prompt") is None


def test_get_input_returns_none_when_upstream_not_run():
    """
    Edge exists but upstream node hasn't put output yet.
    This should not happen in a correct topo sort, but we guard.
    """
    graph = make_graph(
        nodes=[
            {"id": "text-1", "data": {}},
            {"id": "llm-1", "data": {}},
        ],
        edges=[make_edge("text-1", "output", "llm-1", "prompt")],
    )
    ctx = make_ctx(graph=graph, node_outputs={})  # text-1 hasn't run
    assert ctx.get_input("llm-1", "prompt") is None


def test_get_input_multiple_handles_correct_resolution():
    """
    LLM node has two target handles: system and prompt.
    Each should resolve independently to the correct upstream.
    """
    graph = make_graph(
        nodes=[
            {"id": "sys-text",   "data": {}},
            {"id": "user-text",  "data": {}},
            {"id": "llm-1",      "data": {}},
        ],
        edges=[
            make_edge("sys-text",  "output", "llm-1", "system"),
            make_edge("user-text", "output", "llm-1", "prompt"),
        ],
    )
    ctx = make_ctx(
        graph=graph,
        node_outputs={
            "sys-text":  {"output": "You are a helpful assistant.", "dataType": "string"},
            "user-text": {"output": "What is 2+2?", "dataType": "string"},
        },
    )
    assert ctx.get_input("llm-1", "system") == "You are a helpful assistant."
    assert ctx.get_input("llm-1", "prompt") == "What is 2+2?"


def test_get_input_fn_schema_handle():
    """fn-schema handle IDs contain a hyphen — the prefix stripping must handle this."""
    graph = make_graph(
        nodes=[
            {"id": "script-1", "data": {}},
            {"id": "agent-1",  "data": {}},
        ],
        edges=[make_edge("script-1", "fn-schema", "agent-1", "tools")],
    )
    ctx = make_ctx(
        graph=graph,
        node_outputs={"script-1": {"fn-schema": {"name": "my_tool"}, "dataType": "fn-schema"}},
    )
    result = ctx.get_input("agent-1", "tools")
    assert result == {"name": "my_tool"}


# ---------------------------------------------------------------------------
# get_node_data
# ---------------------------------------------------------------------------

def test_get_node_data_returns_field_values():
    graph = make_graph(nodes=[
        {"id": "text-1", "type": "text", "data": {"content": "Hello {{name}}!", "label": "My Text"}},
    ])
    ctx = make_ctx(graph=graph)
    data = ctx.get_node_data("text-1")
    assert data["content"] == "Hello {{name}}!"
    assert data["label"] == "My Text"


def test_get_node_data_returns_empty_dict_for_missing_node():
    ctx = make_ctx(graph=make_graph())
    assert ctx.get_node_data("nonexistent") == {}


# ---------------------------------------------------------------------------
# emit
# ---------------------------------------------------------------------------

def test_emit_puts_event_on_queue():
    queue = asyncio.Queue()
    ctx = make_ctx(sse_queue=queue)
    event = {"type": "node_started", "nodeId": "test-1"}

    asyncio.get_event_loop().run_until_complete(ctx.emit(event))

    assert not queue.empty()
    assert queue.get_nowait() == event


def test_emit_preserves_order():
    """Events must arrive in the order they were emitted."""
    queue = asyncio.Queue()
    ctx = make_ctx(sse_queue=queue)

    async def emit_three():
        await ctx.emit({"type": "a"})
        await ctx.emit({"type": "b"})
        await ctx.emit({"type": "c"})

    asyncio.get_event_loop().run_until_complete(emit_three())

    assert queue.get_nowait()["type"] == "a"
    assert queue.get_nowait()["type"] == "b"
    assert queue.get_nowait()["type"] == "c"
