"""
OutputExecutor — handles Output nodes (execution.kind = 'display').

The Output node is the display terminal. When the workflow completes, the
frontend reads the output node's cached value from the run record and renders
it inline on the canvas.

This executor has two jobs:
  1. Read the value from the connected upstream handle ('value' input)
  2. Store it as the node's output in the context (so the run record captures it)

It does not render anything itself — rendering is a frontend concern. What it
does is normalise the output into a form the frontend can display:
  - Strings are emitted as-is
  - Dicts/lists are stored as-is (frontend will render as a tree view)
  - Everything else is coerced to string

The Output node also updates global_state if configured to accumulate messages.
In Phase 6, this is a no-op stub — the messages accumulation is implemented when
the LLM executor is real (Phase 7).
"""
from __future__ import annotations
import json

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


class OutputExecutor(ExecutorBase):
    """
    Terminal node executor. Reads the connected value and stores it.
    Returns a normalised output dict for the run record.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        # The Output node's input handle ID is 'value' (from output-spec.js)
        raw_value = ctx.get_input(node_id, "value")

        # Determine the data type for the frontend to know how to render
        data_type = _infer_type(raw_value)

        return {
            "value": raw_value,
            "dataType": data_type,
        }


def _infer_type(value: object) -> str:
    """
    Infers the output's data type string for the frontend type system.
    Maps Python types to the DATA_TYPES constants from nodeSpecs.js.
    """
    if value is None:
        return "any"
    if isinstance(value, str):
        return "string"
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, list):
        return "array"
    if isinstance(value, dict):
        return "json"
    return "string"  # fallback — coerce unknown types on the frontend
