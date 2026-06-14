"""
OutputExecutor — handles Output nodes (execution.kind = 'display').

The Output node is the display terminal. When the workflow completes, the
frontend reads the output node's cached value from the run record and renders
it inline on the canvas.
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

        raw_value = ctx.get_input(node_id, "value")
        data_type = _infer_type(raw_value)

        return {
            "value": raw_value,
            "dataType": data_type,
        }


def _infer_type(value: object) -> str:
    """
    Infers the output's data type string for the frontend type system.
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
    return "string"
