"""
Tests for ScriptExecutor — the code-sandbox executor.

Executor.execute() is async, so each test wraps the call in asyncio.run(),
matching the pattern used throughout this backend (no pytest-asyncio dependency).
"""
import asyncio
import pytest

from engine.context import ExecutionContext
from engine.executors.script import ScriptExecutor


def _make_ctx(node_id: str, code: str, *, input_edges: list = None, upstream_outputs: dict = None) -> ExecutionContext:
    node = {"id": node_id, "type": "transform", "data": {"code": code}}
    ctx = ExecutionContext(
        run_id="r1",
        workflow_id="w1",
        graph={
            "nodes": [node],
            "edges": input_edges or [],
        },
    )
    for nid, outputs in (upstream_outputs or {}).items():
        ctx.node_outputs[nid] = outputs
    return ctx


def _node(node_id: str, code: str) -> dict:
    return {"id": node_id, "type": "transform", "data": {"code": code}}


def test_returns_result_from_code():
    ctx = _make_ctx("n1", "result = 'hello from script'")
    output = asyncio.run(ScriptExecutor().execute(_node("n1", "result = 'hello from script'"), ctx))
    assert output["result"] == "hello from script"
    assert output["value"] == "hello from script"
    assert output["dataType"] == "dynamic"


def test_wired_input_injected_as_variable():
    ctx = ExecutionContext(
        run_id="r1",
        workflow_id="w1",
        graph={
            "nodes": [
                {"id": "src", "type": "text", "data": {}},
                {"id": "n1", "type": "transform", "data": {"code": "result = value.upper()"}},
            ],
            "edges": [
                {
                    "source": "src",
                    "sourceHandle": "src-value",
                    "target": "n1",
                    "targetHandle": "n1-value",
                }
            ],
        },
    )
    ctx.node_outputs["src"] = {"value": "hello"}
    output = asyncio.run(
        ScriptExecutor().execute(
            {"id": "n1", "type": "transform", "data": {"code": "result = value.upper()"}},
            ctx,
        )
    )
    assert output["result"] == "HELLO"


def test_unsafe_code_returns_error_key():
    ctx = _make_ctx("n1", "import os; result = os.getcwd()")
    output = asyncio.run(ScriptExecutor().execute(_node("n1", "import os; result = os.getcwd()"), ctx))
    assert "error" in output
    assert output["dataType"] == "error"


def test_no_result_variable_returns_error():
    ctx = _make_ctx("n1", "x = 5")
    output = asyncio.run(ScriptExecutor().execute(_node("n1", "x = 5"), ctx))
    assert "error" in output
    assert output["dataType"] == "error"
