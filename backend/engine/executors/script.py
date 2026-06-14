"""
ScriptExecutor — runs user Python code in the sandboxed subprocess.

Wired inputs are gathered from the context and injected as named variables 
into the sandbox. The user's code must assign `result`.
"""
from __future__ import annotations

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase
from engine.sandbox import run_sandboxed, SandboxError


class ScriptExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)
        code = data.get("code", "")

        inputs = _gather_wired_inputs(node_id, ctx)

        try:
            result = run_sandboxed(code, inputs)
        except SandboxError as e:
            return {"error": str(e), "value": None, "dataType": "error"}

        return {"result": result, "value": result, "dataType": "dynamic"}


def _gather_wired_inputs(node_id: str, ctx: ExecutionContext) -> dict:
    """
    Collects all edges that target this node and returns a dict of
    {handle_id: upstream_value}.
    """
    edges = ctx.graph.get("edges", [])
    inputs = {}
    prefix = f"{node_id}-"
    for edge in edges:
        if edge.get("target") != node_id:
            continue
        target_handle = edge.get("targetHandle", "")
        if not target_handle.startswith(prefix):
            continue
        handle_id = target_handle[len(prefix):]
        value = ctx.get_input(node_id, handle_id)
        if value is not None:
            inputs[handle_id] = value
    return inputs
