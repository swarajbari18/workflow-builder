"""
EmitExecutor — handles Webhook and Cron trigger nodes (execution.kind = 'emit').

Webhook: the trigger payload was already provided by the HTTP request that started
         the pipeline. It arrives in ctx.node_outputs pre-populated by the engine
         before execution begins (see engine.py). This executor simply re-emits it.

Cron:    no payload arrives. The executor emits a tick signal — a minimal dict with
         the timestamp of the fire. Downstream nodes that need data must fetch it
         themselves (API Request nodes, etc.).

In both cases, the executor is the starting node in the pipeline. It has no inputs
to resolve from upstream — everything comes from the trigger context.
"""
from __future__ import annotations
from datetime import datetime, timezone

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class EmitExecutor(ExecutorBase):
    """
    For Webhook trigger nodes: emits the webhook payload that was injected into
    the run context by the /pipelines/run endpoint.

    For Cron/Schedule trigger nodes: emits a tick signal with the current timestamp
    so downstream nodes know when they were triggered.

    The output handle for both is 'payload' (Webhook) or 'tick' (Cron), but we
    normalise both to 'value' here since downstream nodes that follow a trigger
    typically just want "whatever the trigger produced."

    The node data may contain a pre-seeded 'payload' field set by the /run endpoint.
    If not present (Cron), we synthesise one.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        node_type = node.get("type", "")
        data = ctx.get_node_data(node_id)

        if node_type == "cron":
            # Cron fires with no external payload — emit a tick signal
            tick = {
                "triggered_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "scheduler",
            }
            return {"value": tick, "tick": tick, "dataType": "json"}

        # Webhook: payload was pre-seeded into node_outputs by the engine
        # (the /run endpoint injects the request body into the trigger node's output)
        # If already in node_outputs, just re-use it.
        existing = ctx.node_outputs.get(node_id, {})
        payload = existing.get("value") or existing.get("payload") or data.get("payload") or {}

        return {"value": payload, "payload": payload, "dataType": "json"}
