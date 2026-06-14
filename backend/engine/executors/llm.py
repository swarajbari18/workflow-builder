"""
LLMExecutor — streams a Gemini response and emits token SSE events.

Input resolution order:
  system prompt: wired "system" handle → node data "systemPrompt" field → None
  user prompt:   wired "prompt" handle → node data "promptTemplate" field → error

Each streaming chunk is emitted as a token event.
The full accumulated text is returned as the executor output.
"""
from __future__ import annotations

import os

import google.genai as genai
from google.genai import types

from engine.context import ExecutionContext
from engine.events import token
from engine.executors.base import ExecutorBase

_DEFAULT_MODEL = "gemini-2.5-flash"


class LLMExecutor(ExecutorBase):
    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        try:
            from dotenv import load_dotenv
            load_dotenv()
        except ImportError:
            pass

        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        system_prompt = ctx.get_input(node_id, "system") or data.get("systemPrompt")
        user_prompt = ctx.get_input(node_id, "prompt") or data.get("promptTemplate")

        if not user_prompt:
            return {"error": "no prompt: wire a prompt handle or set promptTemplate", "value": None, "dataType": "error"}

        model = data.get("model") or _DEFAULT_MODEL
        if model == "custom":
            model = data.get("customModel") or _DEFAULT_MODEL

        config = types.GenerateContentConfig(
            system_instruction=system_prompt or None,
            max_output_tokens=data.get("maxTokens", 2048),
        )

        api_key = os.environ.get("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)

        full_text = ""
        stream = await client.aio.models.generate_content_stream(
            model=model,
            contents=str(user_prompt),
            config=config,
        )
        async for chunk in stream:
            if chunk.text:
                full_text += chunk.text
                await ctx.emit(token(node_id, chunk.text))

        return {"response": full_text, "value": full_text, "dataType": "string"}
