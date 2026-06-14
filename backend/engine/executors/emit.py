"""
EmitExecutor — handles Webhook and Cron trigger nodes (execution.kind = 'emit').

Webhook: the trigger payload was provided by the HTTP request that started the pipeline.
Cron:    emits a tick signal with the timestamp of the fire.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class EmitExecutor(ExecutorBase):
    """
    Webhook trigger: emits the full payload on 'payload' handle AND each
    user-declared field on its own named handle.

    Cron trigger: emits a tick signal with the current timestamp.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        node_type = node.get("type", "")
        data = ctx.get_node_data(node_id)

        if node_type == "cron":
            tick = {
                "triggered_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "source": "scheduler",
            }
            return {"value": tick, "tick": tick, "dataType": "json"}

        existing = ctx.node_outputs.get(node_id, {})
        payload = existing.get("value") or existing.get("payload") or data.get("payload") or {}

        output: dict = {"value": payload, "payload": payload, "dataType": "json"}

        payload_fields_raw = data.get("payloadFields", "[]") or "[]"
        try:
            payload_fields = json.loads(payload_fields_raw)
        except (json.JSONDecodeError, TypeError):
            payload_fields = []

        for field in payload_fields:
            key = field.get("key") if isinstance(field, dict) else str(field)
            if not key:
                continue
            if isinstance(payload, dict):
                output[key] = payload.get(key)
            else:
                output[key] = None

        return output
