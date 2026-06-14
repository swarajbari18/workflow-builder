"""
LLMExecutor — Phase 6 stub for LLM and Agent nodes (execution.kind = 'llm-call').

Phase 7 replaces this with a real Anthropic/OpenAI API call + token streaming.

The stub returns a clearly marked placeholder so end-to-end tests can verify
the engine routes correctly to this executor without needing API keys.

The stub output format matches what the real executor will return:
  response handle: str (the model's text output)
  dataType: "string"
  streamable: True (Phase 7 will stream tokens through the SSE queue)
"""
from __future__ import annotations

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


_STUB_NOTICE = (
    "[LLM STUB — Phase 7 not yet implemented. "
    "This placeholder will be replaced with a real model call.]"
)


class LLMExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        # Collect what the real executor would use — included so Phase 7 can
        # diff against this stub and know exactly what inputs to consume.
        system_prompt = ctx.get_input(node_id, "system")
        user_prompt = ctx.get_input(node_id, "prompt")
        model = data.get("model", "claude-sonnet-4-5")

        stub_response = (
            f"{_STUB_NOTICE}\n"
            f"[Would call: model={model}]\n"
            f"[system={str(system_prompt)[:80] if system_prompt else 'None'}]\n"
            f"[prompt={str(user_prompt)[:80] if user_prompt else 'None'}]"
        )

        return {"response": stub_response, "value": stub_response, "dataType": "string"}
