"""
TemplateExecutor — handles Text nodes (execution.kind = 'template').

The Text node is a prompt template.
At runtime, this executor:
  1. Reads the template string
  2. Extracts all {{variable}} names
  3. Resolves each variable's value
  4. Substitutes variables into the template
"""
from __future__ import annotations
import json
import re

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


_TEMPLATE_PATTERN = re.compile(r"\{\{(\w+)\}\}")


def _coerce_to_str(value: object) -> str:
    """
    Convert an upstream node's output to a string suitable for template injection.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    return str(value)


class TemplateExecutor(ExecutorBase):
    """
    Renders a {{variable}} template string using values from connected handles.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)
        template = data.get("content", "")

        variable_names = _TEMPLATE_PATTERN.findall(template)

        substitutions: dict[str, str] = {}
        for var in variable_names:
            raw_value = ctx.get_input(node_id, var)
            substitutions[var] = _coerce_to_str(raw_value)

        rendered = _TEMPLATE_PATTERN.sub(
            lambda m: substitutions.get(m.group(1), ""),
            template,
        )

        return {"output": rendered, "value": rendered, "dataType": "string"}


if __name__ == "__main__":
    import asyncio

    async def smoke():
        from engine.context import ExecutionContext

        graph = {
            "nodes": [
                {"id": "text-1", "type": "text", "data": {"content": "Hello {{name}}, your score is {{score}}."}},
                {"id": "input-1", "data": {}},
                {"id": "score-1", "data": {}},
            ],
            "edges": [
                {"source": "input-1", "sourceHandle": "input-1-value", "target": "text-1", "targetHandle": "text-1-name", "data": {}},
                {"source": "score-1", "sourceHandle": "score-1-value", "target": "text-1", "targetHandle": "text-1-score", "data": {}},
            ],
        }
        ctx = ExecutionContext(
            run_id="smoke", workflow_id="smoke-wf", graph=graph,
            node_outputs={
                "input-1": {"value": "Alice"},
                "score-1": {"value": 0.95},
            },
        )
        executor = TemplateExecutor()
        result = await executor.execute({"id": "text-1", "type": "text", "data": {}}, ctx)
        print(f"Rendered: {result['output']!r}")
        assert result["output"] == "Hello Alice, your score is 0.95."
        print("✓ smoke passed")

    asyncio.run(smoke())
