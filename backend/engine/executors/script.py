"""
ScriptExecutor — Phase 6 stub for Transform/Script nodes (execution.kind = 'code-sandbox').
Phase 7 replaces this with a real sandboxed subprocess execution.
"""
from __future__ import annotations

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class ScriptExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)
        description = data.get("description", "(no description)")
        stub = f"[SCRIPT STUB — '{description}' — Phase 7 not yet implemented]"
        return {"result": stub, "value": stub, "dataType": "dynamic"}
