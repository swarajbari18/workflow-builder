"""
AI Assist router — POST /ai/assist

Powers the AI panel in the frontend. Accepts a conversation history and
the node type/field context, then returns an assistant message and any
generated code.

System prompt strategy: each node type gets a purpose-built system prompt
that constrains the AI to produce the right kind of output:
  condition  → Python boolean expression assigned to `result`
  script     → Python transform that assigns `result`
  loop       → Python while-condition expression assigned to `result`
  (default)  → general purpose code assistant

The explanation-first principle from DESIGN-VISION.md is baked into every
system prompt: the AI must explain before presenting code.
"""
from __future__ import annotations

import os
from typing import Any

import google.genai as genai
from google.genai import types
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["ai"])


class ConversationMessage(BaseModel):
    role: str
    content: str


class AssistRequest(BaseModel):
    nodeType: str
    fieldName: str
    conversation: list[ConversationMessage]
    context: dict[str, Any] = {}


class AssistResponse(BaseModel):
    message: str
    generatedCode: str


_SYSTEM_PROMPTS: dict[str, str] = {
    "condition": (
        "You are an AI assistant helping a non-technical user write a Python condition "
        "for a workflow builder.\n\n"
        "The user describes what they want in plain English. You must:\n"
        "1. First explain in 1-2 plain English sentences what you understood and what the "
        "generated condition does. No jargon.\n"
        "2. Then provide a Python expression that evaluates to True or False. "
        "Assign the result to a variable named `result`. Example: `result = score > 80`\n\n"
        "Keep the code on one line if possible. Do not import anything. "
        "Variables from upstream nodes are available by their handle name."
    ),
    "script": (
        "You are an AI assistant helping a non-technical user write a Python data transformation "
        "for a workflow builder.\n\n"
        "The user describes what they want in plain English. You must:\n"
        "1. First explain in 1-2 plain English sentences what you understood and what the "
        "generated code does. No jargon.\n"
        "2. Then provide Python code that performs the transformation. "
        "Assign the final output to a variable named `result`.\n\n"
        "Do not import os, sys, subprocess, socket, or any network/filesystem modules. "
        "Math, json, re, datetime, and collections are fine. "
        "Variables from upstream nodes are available by their handle name."
    ),
    "loop": (
        "You are an AI assistant helping a non-technical user write a Python while-condition "
        "for a loop in a workflow builder.\n\n"
        "The user describes when the loop should continue running. You must:\n"
        "1. First explain in 1-2 plain English sentences what you understood and when "
        "the loop will stop.\n"
        "2. Then provide a Python expression that returns True to continue the loop "
        "or False to stop. Assign it to `result`. Example: `result = count < 10`\n\n"
        "Keep it simple. No imports. Variables are available by name."
    ),
}

_DEFAULT_SYSTEM_PROMPT = (
    "You are an AI assistant helping a non-technical user configure a workflow node. "
    "First explain what you will do in plain English, then provide any code needed. "
    "Keep explanations short and jargon-free."
)


def _build_contents(conversation: list[ConversationMessage]) -> list[types.Content]:
    role_map = {"user": "user", "assistant": "model"}
    return [
        types.Content(
            role=role_map.get(msg.role, "user"),
            parts=[types.Part(text=msg.content)],
        )
        for msg in conversation
    ]


def _extract_code(text: str) -> str:
    """Pulls the first fenced code block out of a markdown response, or returns the full text."""
    import re
    match = re.search(r"```(?:python)?\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    # Fallback: look for a result = ... line
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("result"):
            return stripped
    return text.strip()


@router.post("/assist", response_model=AssistResponse)
async def assist(req: AssistRequest) -> AssistResponse:
    system_prompt = _SYSTEM_PROMPTS.get(req.nodeType, _DEFAULT_SYSTEM_PROMPT)
    contents = _build_contents(req.conversation)

    client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))
    config = types.GenerateContentConfig(
        system_instruction=system_prompt,
        max_output_tokens=1024,
    )

    stream = await client.aio.models.generate_content_stream(
        model="gemini-2.5-flash",
        contents=contents,
        config=config,
    )

    full_text = ""
    async for chunk in stream:
        if chunk.text:
            full_text += chunk.text

    return AssistResponse(
        message=full_text,
        generatedCode=_extract_code(full_text),
    )
