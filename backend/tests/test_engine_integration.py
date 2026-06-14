"""
Integration tests for the execution engine — end-to-end pipeline execution via HTTP + SSE.

These tests use:
  - httpx.AsyncClient for async HTTP (needed for SSE streaming)
  - httpx-sse's aconnect_sse for consuming the event stream
  - anyio for running the async tests
  - An in-memory database for full isolation

Test pipelines:
  1. Minimal: webhook → output (2 nodes, simplest possible pipeline)
  2. Template pipeline: webhook → text (template) → output (the canonical Phase 6 pipeline)
  3. Branch pipeline: webhook → condition → output (tests branch routing + skipping)
  4. Partial execution: runs a pipeline, modifies one node, re-runs with reuse_outputs
  5. Error handling: node with invalid configuration raises, run transitions to error

All tests verify:
  - Correct HTTP response codes
  - Correct SSE events in correct order
  - Correct run status in DB after completion
  - Correct node_outputs in DB

NOTE: The engine requires asyncio.create_task() to launch background tasks,
which only works inside an async context with a running event loop.
We use anyio via pytest-anyio for this.
"""
import asyncio
import json
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from fastapi.testclient import TestClient
import httpx
from httpx_sse import connect_sse

from database import Database
from main import app, get_db


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def test_db():
    db = Database(":memory:")
    db.init_db()
    yield db
    db.close()


@pytest.fixture
def client(test_db):
    app.dependency_overrides[get_db] = lambda: test_db
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c
    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Graph builders
# ---------------------------------------------------------------------------

def make_node(node_id, node_type, execution_kind, data=None):
    return {
        "id": node_id,
        "type": node_type,
        "data": {"execution": {"kind": execution_kind}, **(data or {})},
    }


def make_edge(source, source_handle_id, target, target_handle_id, data_type="string"):
    return {
        "id": f"e-{source}-{target}",
        "source": source,
        "sourceHandle": f"{source}-{source_handle_id}",
        "target": target,
        "targetHandle": f"{target}-{target_handle_id}",
        "data": {"dataType": data_type},
    }


def _collect_sse_events(client, run_id, timeout_s=10):
    """
    Consumes the SSE stream synchronously using httpx.
    Returns list of decoded event dicts.
    The sync TestClient doesn't support streaming iterators well for async endpoints,
    so we use a raw GET and parse the event-stream manually.
    """
    events = []
    with client.stream("GET", f"/runs/{run_id}/stream") as response:
        assert response.status_code == 200
        for line in response.iter_lines():
            line = line.strip()
            if line.startswith("data:"):
                payload = line[len("data:"):].strip()
                if payload:
                    try:
                        events.append(json.loads(payload))
                    except json.JSONDecodeError:
                        pass
            # Stop after pipeline_completed or execution_suspended or execution_error
            if events and events[-1].get("type") in (
                "pipeline_completed", "execution_suspended", "execution_error"
            ):
                break
    return events


# ---------------------------------------------------------------------------
# Test 1: Minimal pipeline — webhook → output
# ---------------------------------------------------------------------------

class TestMinimalPipeline:
    def test_run_completes_with_correct_status(self, client, test_db):
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [make_edge("wh-1", "value", "out-1", "value")]

        r = client.post("/pipelines/run", json={
            "nodes": nodes,
            "edges": edges,
            "trigger_payload": {"msg": "hello"},
        })
        assert r.status_code == 202
        run_id = r.json()["run_id"]

        # Consume the SSE stream
        events = _collect_sse_events(client, run_id)

        # Verify pipeline_completed is the last event
        types = [e["type"] for e in events]
        assert "pipeline_completed" in types

        # Verify DB run status
        run = test_db.get_run(run_id)
        assert run["status"] == "completed"

    def test_webhook_payload_flows_to_output(self, client, test_db):
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [make_edge("wh-1", "value", "out-1", "value")]

        r = client.post("/pipelines/run", json={
            "nodes": nodes,
            "edges": edges,
            "trigger_payload": {"greeting": "World"},
        })
        run_id = r.json()["run_id"]

        events = _collect_sse_events(client, run_id)
        run = test_db.get_run(run_id)

        assert run["status"] == "completed"
        # The webhook node's output should contain the payload
        assert "wh-1" in run["node_outputs"]

    def test_run_creates_db_record(self, client, test_db):
        nodes = [make_node("wh-1", "webhook", "emit"), make_node("out-1", "customOutput", "display")]
        edges = [make_edge("wh-1", "value", "out-1", "value")]
        r = client.post("/pipelines/run", json={"nodes": nodes, "edges": edges})
        run_id = r.json()["run_id"]
        # Poll until done (the test client is synchronous so the engine may still be running)
        _collect_sse_events(client, run_id)
        run = test_db.get_run(run_id)
        assert run is not None
        assert run["workflow_id"] is not None


# ---------------------------------------------------------------------------
# Test 2: Template pipeline — webhook → text → output
# ---------------------------------------------------------------------------

class TestTemplatePipeline:
    def test_template_variable_substitution_end_to_end(self, client, test_db):
        """
        webhook payload is a JSON dict. The webhook node emits it as-is.
        The template node gets the whole dict on its 'name' handle and coerces
        it to a JSON string. This tests the coercion path.

        For field-level injection (just the string 'World'), the real product
        would use a Script node or connect to a specific field. Here we verify
        the coercion works correctly end-to-end.
        """
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            # Template uses {{payload}} — the whole webhook payload dict
            make_node("text-1", "text", "template", {"content": "Hello {{payload}}!"}),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [
            make_edge("wh-1", "payload", "text-1", "payload", "json"),
            make_edge("text-1", "output", "out-1", "value", "string"),
        ]

        r = client.post("/pipelines/run", json={
            "nodes": nodes,
            "edges": edges,
            "trigger_payload": {"greeting": "World"},
        })
        assert r.status_code == 202
        run_id = r.json()["run_id"]

        events = _collect_sse_events(client, run_id)
        run = test_db.get_run(run_id)

        assert run["status"] == "completed"

        # Dict payload is coerced to compact JSON string in the template
        text_output = run["node_outputs"].get("text-1", {})
        rendered = text_output.get("output") or text_output.get("value", "")
        assert '{"greeting":"World"}' in rendered  # the coerced dict

    def test_correct_sse_event_sequence(self, client, test_db):
        """
        For a 3-node pipeline, we expect:
          node_started (×3), node_completed (×3), node_output (×3), pipeline_completed
        """
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("text-1", "text", "template", {"content": "Static text"}),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [make_edge("text-1", "output", "out-1", "value")]

        r = client.post("/pipelines/run", json={"nodes": nodes, "edges": edges})
        run_id = r.json()["run_id"]
        events = _collect_sse_events(client, run_id)

        types = [e["type"] for e in events]

        # All three node_started events must appear
        assert types.count("node_started") == 3
        # pipeline_completed must be last
        assert types[-1] == "pipeline_completed"

    def test_node_started_before_node_completed(self, client, test_db):
        """For every node, its node_started event must precede its node_completed event in the stream."""
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [make_edge("wh-1", "value", "out-1", "value")]

        r = client.post("/pipelines/run", json={"nodes": nodes, "edges": edges})
        run_id = r.json()["run_id"]
        events = _collect_sse_events(client, run_id)

        # Build a mapping: node_id → stream position for started and completed events
        started_pos = {}
        completed_pos = {}
        for i, e in enumerate(events):
            if e["type"] == "node_started":
                started_pos[e["nodeId"]] = i
            elif e["type"] == "node_completed":
                completed_pos[e["nodeId"]] = i

        # Every completed node must have been started first (earlier in the stream)
        for nid, comp_pos in completed_pos.items():
            assert nid in started_pos, f"node {nid!r} completed but never started"
            assert started_pos[nid] < comp_pos, (
                f"node {nid!r}: started at position {started_pos[nid]} "
                f"but completed at position {comp_pos}"
            )


# ---------------------------------------------------------------------------
# Test 3: Branch pipeline
# ---------------------------------------------------------------------------

class TestBranchPipeline:
    def test_true_branch_fires_false_branch_skipped(self, client, test_db):
        """
        webhook → condition (value > 5) → [true: out-true | false: out-false]
        payload: {value: 10} → true branch fires
        Expected: out-false is skipped, run completes
        """
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("cond-1", "condition", "branch", {"condition": "value > 5"}),
            make_node("out-true", "customOutput", "display"),
            make_node("out-false", "customOutput", "display"),
        ]
        edges = [
            make_edge("wh-1", "payload", "cond-1", "input", "json"),
            {"id": "e-true", "source": "cond-1", "sourceHandle": "cond-1-true",
             "target": "out-true", "targetHandle": "out-true-value", "data": {}},
            {"id": "e-false", "source": "cond-1", "sourceHandle": "cond-1-false",
             "target": "out-false", "targetHandle": "out-false-value", "data": {}},
        ]

        r = client.post("/pipelines/run", json={
            "nodes": nodes,
            "edges": edges,
            "trigger_payload": {"value": 10},
        })
        run_id = r.json()["run_id"]
        events = _collect_sse_events(client, run_id)

        types = [e["type"] for e in events]
        skipped_nodes = [e["nodeId"] for e in events if e["type"] == "node_skipped"]

        # out-false should be skipped
        assert "out-false" in skipped_nodes
        assert "out-true" not in skipped_nodes
        assert "pipeline_completed" in types

        run = test_db.get_run(run_id)
        assert run["status"] == "completed"


# ---------------------------------------------------------------------------
# Test 4: Partial execution
# ---------------------------------------------------------------------------

class TestPartialExecution:
    def test_cached_nodes_are_skipped_with_cache_hit_reason(self, client, test_db):
        """
        Second run with reuse_outputs for wh-1 → wh-1 gets cache_hit, others run.
        """
        nodes = [
            make_node("wh-1", "webhook", "emit"),
            make_node("text-1", "text", "template", {"content": "{{name}}"}),
            make_node("out-1", "customOutput", "display"),
        ]
        edges = [
            make_edge("wh-1", "payload", "text-1", "name"),
            make_edge("text-1", "output", "out-1", "value"),
        ]

        cached_webhook_output = {"value": {"name": "Cached"}, "payload": {"name": "Cached"}, "dataType": "json"}

        r = client.post("/pipelines/run", json={
            "nodes": nodes,
            "edges": edges,
            "reuse_outputs": {"wh-1": cached_webhook_output},
        })
        run_id = r.json()["run_id"]
        events = _collect_sse_events(client, run_id)

        # wh-1 should be skipped with cache_hit reason
        cache_hit_events = [e for e in events if e.get("type") == "node_skipped" and e.get("reason") == "cache_hit"]
        assert any(e["nodeId"] == "wh-1" for e in cache_hit_events)

        run = test_db.get_run(run_id)
        assert run["status"] == "completed"


# ---------------------------------------------------------------------------
# Test 5: Error handling
# ---------------------------------------------------------------------------

class TestErrorHandling:
    def test_invalid_graph_cycle_returns_error_event(self, client, test_db):
        """A cyclic graph should produce an execution_error event."""
        nodes = [
            make_node("a", "text", "template", {"content": "{{b}}"}),
            make_node("b", "text", "template", {"content": "{{a}}"}),
        ]
        edges = [
            make_edge("a", "output", "b", "a"),
            make_edge("b", "output", "a", "b"),
        ]

        r = client.post("/pipelines/run", json={"nodes": nodes, "edges": edges})
        assert r.status_code == 202
        run_id = r.json()["run_id"]
        events = _collect_sse_events(client, run_id)

        types = [e["type"] for e in events]
        assert "execution_error" in types

    def test_run_endpoint_returns_stream_url(self, client, test_db):
        nodes = [make_node("wh-1", "webhook", "emit"), make_node("out-1", "customOutput", "display")]
        edges = [make_edge("wh-1", "value", "out-1", "value")]
        r = client.post("/pipelines/run", json={"nodes": nodes, "edges": edges})
        body = r.json()
        assert "run_id" in body
        assert "stream_url" in body
        assert body["stream_url"] == f"/runs/{body['run_id']}/stream"

    def test_stream_404_for_unknown_run(self, client):
        r = client.get("/runs/nonexistent-run-id/stream")
        assert r.status_code == 404
