"""
Tests for TemplateExecutor, EmitExecutor, and OutputExecutor.

These three are the simplest executors and form the backbone of the integration test
pipeline: webhook → text → output.
"""
import asyncio
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine.context import ExecutionContext
from engine.executors.template import TemplateExecutor, _coerce_to_str
from engine.executors.emit import EmitExecutor
from engine.executors.output import OutputExecutor, _infer_type


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_edge(source, source_handle_id, target, target_handle_id):
    return {
        "source": source, "sourceHandle": f"{source}-{source_handle_id}",
        "target": target, "targetHandle": f"{target}-{target_handle_id}",
        "data": {},
    }

def make_ctx(nodes=None, edges=None, node_outputs=None):
    return ExecutionContext(
        run_id="test", workflow_id="wf",
        graph={"nodes": nodes or [], "edges": edges or []},
        node_outputs=node_outputs or {},
    )

def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ===========================================================================
# TemplateExecutor
# ===========================================================================

class TestCoerceToStr:
    def test_string_passthrough(self):
        assert _coerce_to_str("hello") == "hello"

    def test_none_becomes_empty_string(self):
        assert _coerce_to_str(None) == ""

    def test_dict_becomes_json(self):
        result = _coerce_to_str({"a": 1})
        assert result == '{"a":1}'  # compact JSON, not Python repr

    def test_list_becomes_json(self):
        result = _coerce_to_str([1, 2, 3])
        assert result == "[1,2,3]"

    def test_int_becomes_str(self):
        assert _coerce_to_str(42) == "42"

    def test_float_precision_preserved(self):
        assert _coerce_to_str(3.14) == "3.14"


class TestTemplateExecutor:
    def test_simple_substitution(self):
        nodes = [
            {"id": "text-1", "type": "text", "data": {"content": "Hello {{name}}!"}},
            {"id": "up-1", "data": {}},
        ]
        edges = [make_edge("up-1", "value", "text-1", "name")]
        ctx = make_ctx(nodes=nodes, edges=edges, node_outputs={"up-1": {"value": "World"}})
        result = run(TemplateExecutor().execute({"id": "text-1", "type": "text", "data": {}}, ctx))
        assert result["output"] == "Hello World!"
        assert result["dataType"] == "string"

    def test_multiple_variables(self):
        nodes = [
            {"id": "text-1", "data": {"content": "{{greeting}}, {{name}}. Score: {{score}}"}},
            {"id": "g", "data": {}}, {"id": "n", "data": {}}, {"id": "s", "data": {}},
        ]
        edges = [
            make_edge("g", "value", "text-1", "greeting"),
            make_edge("n", "value", "text-1", "name"),
            make_edge("s", "value", "text-1", "score"),
        ]
        ctx = make_ctx(nodes=nodes, edges=edges, node_outputs={
            "g": {"value": "Hi"},
            "n": {"value": "Alice"},
            "s": {"value": 0.95},
        })
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert result["output"] == "Hi, Alice. Score: 0.95"

    def test_missing_variable_substitutes_empty_string(self):
        """Unconnected {{var}} becomes "" — not left as {{var}}."""
        nodes = [{"id": "text-1", "data": {"content": "Hello {{name}}!"}}]
        ctx = make_ctx(nodes=nodes, edges=[], node_outputs={})
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert result["output"] == "Hello !"

    def test_no_variables_returns_template_unchanged(self):
        nodes = [{"id": "text-1", "data": {"content": "Static prompt with no vars."}}]
        ctx = make_ctx(nodes=nodes)
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert result["output"] == "Static prompt with no vars."

    def test_json_object_upstream_becomes_compact_json(self):
        """If an LLM outputs a JSON object and it's piped into a template, it should be readable."""
        nodes = [
            {"id": "text-1", "data": {"content": "Data: {{payload}}"}},
            {"id": "api-1", "data": {}},
        ]
        edges = [make_edge("api-1", "response", "text-1", "payload")]
        ctx = make_ctx(nodes=nodes, edges=edges, node_outputs={
            "api-1": {"response": {"status": "ok", "count": 3}},
        })
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert result["output"] == 'Data: {"status":"ok","count":3}'

    def test_empty_template_returns_empty_string(self):
        nodes = [{"id": "text-1", "data": {"content": ""}}]
        ctx = make_ctx(nodes=nodes)
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert result["output"] == ""

    def test_output_key_matches_source_handle(self):
        """The 'output' key must be present — it's the source handle ID in nodeSpecs.js."""
        nodes = [{"id": "text-1", "data": {"content": "hi"}}]
        ctx = make_ctx(nodes=nodes)
        result = run(TemplateExecutor().execute({"id": "text-1", "data": {}}, ctx))
        assert "output" in result
        assert "value" in result
        assert result["output"] == result["value"]


# ===========================================================================
# EmitExecutor
# ===========================================================================

class TestEmitExecutor:
    def test_webhook_emits_pre_seeded_payload(self):
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {}}],
            node_outputs={"wh-1": {"value": {"name": "World"}, "dataType": "json"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {}}, ctx))
        assert result["payload"] == {"name": "World"}
        assert result["dataType"] == "json"

    def test_cron_emits_tick_signal(self):
        ctx = make_ctx(nodes=[{"id": "cron-1", "type": "cron", "data": {}}])
        result = run(EmitExecutor().execute({"id": "cron-1", "type": "cron", "data": {}}, ctx))
        assert "triggered_at" in result["tick"]
        assert result["tick"]["source"] == "scheduler"
        assert result["dataType"] == "json"

    def test_webhook_with_no_pre_seeded_payload_returns_empty_dict(self):
        ctx = make_ctx(nodes=[{"id": "wh-1", "type": "webhook", "data": {}}])
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {}}, ctx))
        assert result["payload"] == {}

    # --- new: field extraction ---

    def test_declared_field_extracted_as_own_output_key(self):
        """
        User declared 'customer_name' field. Payload has that key.
        Output must have output['customer_name'] = 'Alice'.
        """
        import json
        fields = json.dumps([{"key": "customer_name", "label": "customer name", "dataType": "string"}])
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}],
            node_outputs={"wh-1": {"value": {"customer_name": "Alice", "price": 29.99}, "dataType": "json"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}, ctx))
        assert result["customer_name"] == "Alice"
        # payload whole blob still present
        assert result["payload"]["price"] == 29.99

    def test_multiple_declared_fields_all_extracted(self):
        import json
        fields = json.dumps([
            {"key": "name",  "label": "name",  "dataType": "string"},
            {"key": "score", "label": "score", "dataType": "number"},
            {"key": "tier",  "label": "tier",  "dataType": "string"},
        ])
        payload = {"name": "Bob", "score": 0.92, "tier": "pro", "extra": "ignored"}
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}],
            node_outputs={"wh-1": {"value": payload, "dataType": "json"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}, ctx))
        assert result["name"] == "Bob"
        assert result["score"] == 0.92
        assert result["tier"] == "pro"
        # Key not declared → not in output as its own key (only in payload blob)
        assert "extra" not in result or result.get("extra") is None

    def test_declared_field_missing_from_payload_returns_none(self):
        """Payload doesn't have the declared key — output[key] should be None, not crash."""
        import json
        fields = json.dumps([{"key": "missing_key", "label": "missing", "dataType": "string"}])
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}],
            node_outputs={"wh-1": {"value": {"other_key": "present"}, "dataType": "json"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}, ctx))
        assert result["missing_key"] is None

    def test_non_dict_payload_skips_field_extraction_safely(self):
        """Payload is a plain string — field extraction must not crash."""
        import json
        fields = json.dumps([{"key": "name", "label": "name", "dataType": "string"}])
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}],
            node_outputs={"wh-1": {"value": "plain-string-payload", "dataType": "string"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}, ctx))
        assert result["name"] is None  # extraction skipped, returned None
        assert result["payload"] == "plain-string-payload"  # whole value still passed through

    def test_same_field_can_connect_to_multiple_nodes(self):
        """
        This is a routing test: confirms that the output dict has the key so it CAN
        be resolved by get_input() from multiple downstream nodes independently.
        (React Flow allows multiple edges from one source handle — this verifies the
        backend output dict supports it by having the key present once, readable N times.)
        """
        import json
        fields = json.dumps([{"key": "email", "label": "email", "dataType": "string"}])
        ctx = make_ctx(
            nodes=[{"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}],
            node_outputs={"wh-1": {"value": {"email": "user@example.com"}, "dataType": "json"}},
        )
        result = run(EmitExecutor().execute({"id": "wh-1", "type": "webhook", "data": {"payloadFields": fields}}, ctx))
        # The same 'email' value can be read by any number of get_input() calls
        assert result["email"] == "user@example.com"
        assert result["payload"]["email"] == "user@example.com"  # also available via the blob


# ===========================================================================
# OutputExecutor + _infer_type
# ===========================================================================

class TestInferType:
    def test_string(self): assert _infer_type("hello") == "string"
    def test_int(self):    assert _infer_type(42) == "number"
    def test_float(self):  assert _infer_type(3.14) == "number"
    def test_bool(self):   assert _infer_type(True) == "boolean"
    def test_list(self):   assert _infer_type([1, 2]) == "array"
    def test_dict(self):   assert _infer_type({"a": 1}) == "json"
    def test_none(self):   assert _infer_type(None) == "any"


class TestOutputExecutor:
    def test_reads_connected_value(self):
        nodes = [
            {"id": "out-1", "type": "customOutput", "data": {}},
            {"id": "llm-1", "data": {}},
        ]
        edges = [make_edge("llm-1", "response", "out-1", "value")]
        ctx = make_ctx(nodes=nodes, edges=edges, node_outputs={
            "llm-1": {"response": "The answer is 42."},
        })
        result = run(OutputExecutor().execute({"id": "out-1", "data": {}}, ctx))
        assert result["value"] == "The answer is 42."
        assert result["dataType"] == "string"

    def test_returns_none_when_nothing_connected(self):
        nodes = [{"id": "out-1", "data": {}}]
        ctx = make_ctx(nodes=nodes)
        result = run(OutputExecutor().execute({"id": "out-1", "data": {}}, ctx))
        assert result["value"] is None
        assert result["dataType"] == "any"

    def test_json_input_preserved_as_dict(self):
        nodes = [
            {"id": "out-1", "data": {}},
            {"id": "api-1", "data": {}},
        ]
        edges = [make_edge("api-1", "response", "out-1", "value")]
        ctx = make_ctx(nodes=nodes, edges=edges, node_outputs={
            "api-1": {"response": {"users": [1, 2, 3]}},
        })
        result = run(OutputExecutor().execute({"id": "out-1", "data": {}}, ctx))
        assert result["value"] == {"users": [1, 2, 3]}
        assert result["dataType"] == "json"
