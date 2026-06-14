"""
HTTPExecutor — Phase 6 stub for API Request nodes (execution.kind = 'http-request').
Phase 7 replaces this with a real httpx async call.
"""
from __future__ import annotations

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class HTTPExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)
        url = data.get("url", "(not configured)")
        method = data.get("method", "GET")
        stub = f"[HTTP STUB — {method} {url} — Phase 7 not yet implemented]"
        return {"response": stub, "value": stub, "dataType": "json"}
