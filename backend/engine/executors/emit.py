"""
EmitExecutor — handles Webhook and Cron trigger nodes (execution.kind = 'emit').

Webhook: the trigger payload was already provided by the HTTP request that started
         the pipeline. It arrives in ctx.node_outputs pre-populated by the engine
         before execution begins. This executor:
           1. Emits the whole payload on the `payload` handle (for the "Everything" connection)
           2. Extracts each user-declared field and emits it on its own keyed output
              so Text templates and other nodes can wire to individual fields by name.

         The declared fields come from node.data.payloadFields — a JSON-serialised list
         of {key, label, dataType} objects. This matches exactly what the WebhookNode UI
         stores when the user clicks "Use →" on a field.

Cron:    no payload arrives. The executor emits a tick signal — a minimal dict with
         the timestamp of the fire. Cron nodes have no field declarations.

Multi-target confirmation:
  Each output key (payload, customer_name, price, ...) is a separate entry in the
  returned output dict. The engine stores this dict in ctx.node_outputs[node_id].
  When any downstream node calls ctx.get_input(downstream_id, handle_id), the engine
  finds the edge, reads the sourceHandle (e.g. "wh-1-customer_name"), strips the node
  prefix to get "customer_name", and looks up ctx.node_outputs["wh-1"]["customer_name"].
  This works for any number of downstream connections — there is no limit.
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

        # Webhook: payload was pre-seeded into node_outputs by the engine from trigger_payload.
        existing = ctx.node_outputs.get(node_id, {})
        payload = existing.get("value") or existing.get("payload") or data.get("payload") or {}

        # Base output: the whole payload blob on the 'payload' handle (always present)
        output: dict = {"value": payload, "payload": payload, "dataType": "json"}

        # Field extraction: each user-declared field gets its own output key.
        # payloadFields is stored as a JSON string in node.data (the field system
        # uses string storage). We parse it here.
        payload_fields_raw = data.get("payloadFields", "[]") or "[]"
        try:
            payload_fields = json.loads(payload_fields_raw)
        except (json.JSONDecodeError, TypeError):
            payload_fields = []

        for field in payload_fields:
            key = field.get("key") if isinstance(field, dict) else str(field)
            if not key:
                continue
            # Extract the field from the payload dict.
            # If the payload is not a dict (e.g. a plain string was sent), skip field extraction.
            if isinstance(payload, dict):
                output[key] = payload.get(key)  # None if key missing — handled by downstream
            else:
                output[key] = None

        return output
