"""
InputExecutor — handles Input nodes (execution.kind = 'suspend').

The Input node is a PAUSE GATE that can appear anywhere. When execution reaches it,
the pipeline halts, notifies a client app, and waits for a human response.

Resume detection:
  When a run resumes, the engine re-plays the sequence. When it reaches the 
  Input node again, the output is already in ctx.node_outputs — the executor 
  passes through without suspending.
"""
from __future__ import annotations
import uuid

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase, SuspendExecution


class InputExecutor(ExecutorBase):
    """
    Pause-gate executor. Halts execution awaiting human input.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        existing = ctx.node_outputs.get(node_id, {})
        if "value" in existing:
            return {
                "value": existing["value"],
                "dataType": "string",
            }

        prompt_value = ctx.get_input(node_id, "prompt")
        prompt_text = str(prompt_value) if prompt_value is not None else (
            data.get("label", "Please provide input")
        )

        notify_url = data.get("notifyUrl", "")
        callback_token = str(uuid.uuid4())

        raise SuspendExecution(
            node_id=node_id,
            prompt=prompt_text,
            notify_url=notify_url,
            callback_token=callback_token,
        )
