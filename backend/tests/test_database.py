"""
Database layer tests — real SQLite, no mocking.

Uses a per-test in-memory SQLite database (':memory:') so tests are fully
isolated and require no cleanup. Each test gets a fresh database via the
`db` fixture.

Run: pytest tests/test_database.py -v
"""
import pytest
import json
from database import Database


@pytest.fixture
def db():
    """Fresh in-memory database for each test."""
    database = Database(":memory:")
    database.init_db()
    yield database
    database.close()


# ---------------------------------------------------------------------------
# Workflow CRUD
# ---------------------------------------------------------------------------

class TestWorkflowCRUD:
    def test_create_workflow(self, db):
        wf = db.create_workflow("My Pipeline", {"nodes": [], "edges": []})
        assert wf["id"]
        assert wf["name"] == "My Pipeline"
        assert wf["definition"] == {"nodes": [], "edges": []}
        assert wf["created_at"]
        assert wf["updated_at"]

    def test_get_workflow(self, db):
        created = db.create_workflow("Test Flow", {"nodes": [{"id": "a"}], "edges": []})
        fetched = db.get_workflow(created["id"])
        assert fetched["id"] == created["id"]
        assert fetched["name"] == "Test Flow"
        assert fetched["definition"] == {"nodes": [{"id": "a"}], "edges": []}

    def test_get_nonexistent_workflow_returns_none(self, db):
        result = db.get_workflow("nonexistent-id")
        assert result is None

    def test_list_workflows(self, db):
        db.create_workflow("Flow A", {"nodes": [], "edges": []})
        db.create_workflow("Flow B", {"nodes": [], "edges": []})
        workflows = db.list_workflows()
        assert len(workflows) == 2
        names = {w["name"] for w in workflows}
        assert names == {"Flow A", "Flow B"}

    def test_list_workflows_empty(self, db):
        assert db.list_workflows() == []

    def test_update_workflow_name(self, db):
        wf = db.create_workflow("Old Name", {"nodes": [], "edges": []})
        updated = db.update_workflow(wf["id"], name="New Name")
        assert updated["name"] == "New Name"
        assert updated["id"] == wf["id"]

    def test_update_workflow_definition(self, db):
        wf = db.create_workflow("Flow", {"nodes": [], "edges": []})
        new_def = {"nodes": [{"id": "x"}], "edges": [{"source": "x"}]}
        updated = db.update_workflow(wf["id"], definition=new_def)
        assert updated["definition"] == new_def

    def test_update_nonexistent_workflow_returns_none(self, db):
        result = db.update_workflow("no-such-id", name="X")
        assert result is None

    def test_each_workflow_gets_unique_id(self, db):
        w1 = db.create_workflow("A", {})
        w2 = db.create_workflow("B", {})
        assert w1["id"] != w2["id"]


# ---------------------------------------------------------------------------
# Run CRUD
# ---------------------------------------------------------------------------

class TestRunCRUD:
    def test_create_run(self, db):
        wf = db.create_workflow("Flow", {"nodes": [], "edges": []})
        run = db.create_run(wf["id"])
        assert run["id"]
        assert run["workflow_id"] == wf["id"]
        assert run["status"] == "created"
        assert run["node_outputs"] == {}
        assert run["global_state"] == {"messages": [], "variables": {}}

    def test_get_run(self, db):
        wf = db.create_workflow("Flow", {})
        created = db.create_run(wf["id"])
        fetched = db.get_run(created["id"])
        assert fetched["id"] == created["id"]
        assert fetched["status"] == "created"

    def test_get_nonexistent_run_returns_none(self, db):
        assert db.get_run("no-such-run") is None

    def test_update_run(self, db):
        wf = db.create_workflow("Flow", {})
        run = db.create_run(wf["id"])
        updated = db.update_run(run["id"], {"status": "running", "current_node_id": "llm-1"})
        assert updated["status"] == "running"
        assert updated["current_node_id"] == "llm-1"

    def test_update_run_json_fields_round_trip(self, db):
        wf = db.create_workflow("Flow", {})
        run = db.create_run(wf["id"])
        new_outputs = {"llm-1": {"value": "hello", "dataType": "string"}}
        updated = db.update_run(run["id"], {
            "status": "running",
            "node_outputs": new_outputs,
        })
        assert updated["node_outputs"] == new_outputs

    def test_update_nonexistent_run_returns_none(self, db):
        result = db.update_run("no-such-run", {"status": "running"})
        assert result is None

    def test_multiple_runs_for_same_workflow(self, db):
        wf = db.create_workflow("Flow", {})
        r1 = db.create_run(wf["id"])
        r2 = db.create_run(wf["id"])
        assert r1["id"] != r2["id"]
        assert r1["workflow_id"] == r2["workflow_id"]


# ---------------------------------------------------------------------------
# JSON column round-trip
# ---------------------------------------------------------------------------

class TestJsonRoundTrip:
    def test_complex_definition_round_trips(self, db):
        definition = {
            "nodes": [
                {"id": "text-1", "type": "text", "data": {"content": "Hello {{name}}"}},
                {"id": "llm-1", "type": "llm", "data": {"model": "claude-sonnet-4-6"}},
            ],
            "edges": [
                {"source": "text-1", "target": "llm-1", "data": {"dataType": "string"}}
            ],
        }
        wf = db.create_workflow("Complex", definition)
        fetched = db.get_workflow(wf["id"])
        assert fetched["definition"] == definition

    def test_global_state_round_trips(self, db):
        wf = db.create_workflow("Flow", {})
        run = db.create_run(wf["id"])
        global_state = {
            "messages": [{"role": "user", "content": "Hello"}, {"role": "assistant", "content": "Hi"}],
            "variables": {"counter": 3, "score": 0.84},
        }
        updated = db.update_run(run["id"], {"global_state": global_state})
        fetched = db.get_run(updated["id"])
        assert fetched["global_state"] == global_state

    def test_suspension_context_round_trips(self, db):
        wf = db.create_workflow("Flow", {})
        run = db.create_run(wf["id"])
        ctx = {
            "node_id": "input-2",
            "prompt": "Should I proceed with deletion?",
            "callback_token": "tok_abc123",
            "callback_url": "https://backend/runs/xyz/resume",
            "notify_url": "https://client.example.com/pipeline-input",
        }
        updated = db.update_run(run["id"], {"suspension_context": ctx})
        fetched = db.get_run(updated["id"])
        assert fetched["suspension_context"] == ctx
