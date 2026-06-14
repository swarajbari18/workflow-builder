"""
InputExecutor — handles Input nodes (execution.kind = 'suspend').

The Input node is NOT a data source that sits at the beginning of a pipeline.
It is a PAUSE GATE that can appear anywhere. When execution reaches it,
the pipeline halts, notifies a client app, and waits for a human response.
(DESIGN-VISION.md Decision 2 — re-read this if the design feels wrong.)

Two execution modes:
  1. Development mode (ctx.is_development = True):
     The pipeline builder shows an inline text field inside the node on the canvas.
     The user types their test response there and presses Continue. No webhook fires.
     In this mode, if the node's output is already populated in ctx.node_outputs
     (i.e. the user already responded via the /resume endpoint or the frontend
     pre-populated it), we use that value and continue normally without suspending.

  2. Production mode (ctx.is_development = False):
     We raise SuspendExecution. The engine catches this, calls transition_to_suspended,
     writes the suspension context to the DB, and fires the notification webhook.
     The run waits until /resume is called.

Resume detection:
  When a run resumes (via /runs/{id}/resume), the state_machine's resume_from_suspended
  writes the human's response into run.node_outputs[input_node_id]['value'].
  The engine re-plays the node sequence but skips already-completed nodes.
  When it reaches the Input node again, the output is already in ctx.node_outputs —
  the check at the top of execute() catches this and passes through without suspending.

This is the "same runtime" principle: the code path is identical for dev and prod.
Only the input source differs.
"""
from __future__ import annotations
import uuid

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase, SuspendExecution


class InputExecutor(ExecutorBase):
    """
    Pause-gate executor. Halts execution awaiting human input.

    If the response is already in ctx.node_outputs (from a prior resume call),
    passes through immediately. Otherwise raises SuspendExecution.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        # Check: has this node already received its response?
        # (This happens when the engine replays after a resume call)
        existing = ctx.node_outputs.get(node_id, {})
        if "value" in existing:
            # Response already provided — pass it downstream and continue
            return {
                "value": existing["value"],
                "dataType": "string",
            }

        # No response yet. In dev mode, the frontend provides it inline.
        # In production, we fire the webhook and suspend.
        prompt_value = ctx.get_input(node_id, "prompt")
        prompt_text = str(prompt_value) if prompt_value is not None else (
            data.get("label", "Please provide input")
        )

        if ctx.is_development:
            # Dev mode: suspend just like production — the frontend will call /resume
            # with an inline response. We don't distinguish at this layer.
            pass

        notify_url = data.get("notifyUrl", "")
        callback_token = str(uuid.uuid4())
        callback_url = f"/runs/{ctx.run_id}/resume"

        raise SuspendExecution(
            node_id=node_id,
            prompt=prompt_text,
            notify_url=notify_url,
            callback_token=callback_token,
        )
