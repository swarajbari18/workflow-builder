"""
API endpoint tests — FastAPI TestClient, real SQLite in-memory.

Uses FastAPI's dependency override system to inject a fresh Database(':memory:')
for each test. This makes tests fast, isolated, and runnable without a running server.

Run: pytest tests/test_api.py -v
"""
import pytest
from fastapi.testclient import TestClient
from database import Database
from main import app, get_db


@pytest.fixture
def client():
    """
    TestClient with a fresh in-memory database injected via dependency override.
    The override is removed after each test so tests don't share state.
    """
    test_db = Database(":memory:")
    test_db.init_db()

    app.dependency_overrides[get_db] = lambda: test_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    test_db.close()


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

class TestHealth:
    def test_health_check(self, client):
        r = client.get("/")
        assert r.status_code == 200
        assert r.json() == {"ping": "pong"}


# ---------------------------------------------------------------------------
# /pipelines/parse
# ---------------------------------------------------------------------------

class TestPipelineParse:
    def test_linear_chain_is_dag(self, client):
        payload = {
            "nodes": [{"id": "a", "type": "llm"}, {"id": "b", "type": "customOutput"}],
            "edges": [{"source": "a", "target": "b", "sourceHandle": "a-response",
                       "targetHandle": "b-value", "data": {"dataType": "string"}}],
        }
        r = client.post("/pipelines/parse", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["is_dag"] is True
        assert data["num_nodes"] == 2
        assert data["num_edges"] == 1
        assert "topo_order" in data

    def test_cycle_is_not_dag(self, client):
        payload = {
            "nodes": [{"id": "a"}, {"id": "b"}],
            "edges": [
                {"source": "a", "target": "b", "sourceHandle": "a-o", "targetHandle": "b-i", "data": {}},
                {"source": "b", "target": "a", "sourceHandle": "b-o", "targetHandle": "a-i", "data": {}},
            ],
        }
        r = client.post("/pipelines/parse", json=payload)
        assert r.status_code == 200
        assert r.json()["is_dag"] is False

    def test_fn_schema_edge_does_not_block_dag(self, client):
        payload = {
            "nodes": [
                {"id": "inp", "type": "customInput"},
                {"id": "script", "type": "script"},
                {"id": "agent", "type": "agent"},
                {"id": "out", "type": "customOutput"},
            ],
            "edges": [
                {"source": "inp", "target": "agent", "sourceHandle": "inp-value",
                 "targetHandle": "agent-prompt", "data": {"dataType": "string"}},
                {"source": "script", "target": "agent", "sourceHandle": "script-fn-schema",
                 "targetHandle": "agent-tools", "data": {"dataType": "fn-schema"}},
                {"source": "agent", "target": "out", "sourceHandle": "agent-response",
                 "targetHandle": "out-value", "data": {"dataType": "string"}},
            ],
        }
        r = client.post("/pipelines/parse", json=payload)
        assert r.status_code == 200
        data = r.json()
        assert data["is_dag"] is True

    def test_empty_graph_is_dag(self, client):
        r = client.post("/pipelines/parse", json={"nodes": [], "edges": []})
        assert r.status_code == 200
        assert r.json()["is_dag"] is True


# ---------------------------------------------------------------------------
# Workflow CRUD endpoints
# ---------------------------------------------------------------------------

class TestWorkflowEndpoints:
    def test_create_workflow(self, client):
        r = client.post("/workflows", json={
            "name": "My Pipeline",
            "definition": {"nodes": [], "edges": []},
        })
        assert r.status_code == 201
        data = r.json()
        assert data["id"]
        assert data["name"] == "My Pipeline"

    def test_get_workflow(self, client):
        created = client.post("/workflows", json={
            "name": "Test", "definition": {"nodes": [], "edges": []}
        }).json()
        r = client.get(f"/workflows/{created['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == created["id"]

    def test_get_nonexistent_workflow_404(self, client):
        r = client.get("/workflows/nonexistent")
        assert r.status_code == 404

    def test_list_workflows(self, client):
        client.post("/workflows", json={"name": "A", "definition": {}})
        client.post("/workflows", json={"name": "B", "definition": {}})
        r = client.get("/workflows")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_update_workflow(self, client):
        created = client.post("/workflows", json={
            "name": "Old", "definition": {"nodes": [], "edges": []}
        }).json()
        r = client.put(f"/workflows/{created['id']}", json={"name": "New"})
        assert r.status_code == 200
        assert r.json()["name"] == "New"

    def test_update_nonexistent_workflow_404(self, client):
        r = client.put("/workflows/nonexistent", json={"name": "X"})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Run lifecycle endpoints
# ---------------------------------------------------------------------------

class TestRunEndpoints:
    def _create_workflow(self, client) -> str:
        return client.post("/workflows", json={
            "name": "Flow", "definition": {"nodes": [], "edges": []}
        }).json()["id"]

    def test_create_run(self, client):
        wf_id = self._create_workflow(client)
        r = client.post(f"/workflows/{wf_id}/runs")
        assert r.status_code == 201
        data = r.json()
        assert data["id"]
        assert data["workflow_id"] == wf_id
        assert data["status"] == "created"

    def test_create_run_nonexistent_workflow_404(self, client):
        r = client.post("/workflows/no-such-wf/runs")
        assert r.status_code == 404

    def test_get_run(self, client):
        wf_id = self._create_workflow(client)
        run_id = client.post(f"/workflows/{wf_id}/runs").json()["id"]
        r = client.get(f"/runs/{run_id}")
        assert r.status_code == 200
        assert r.json()["id"] == run_id

    def test_get_nonexistent_run_404(self, client):
        r = client.get("/runs/nonexistent")
        assert r.status_code == 404

    def test_resume_run_valid_token(self, client):
        """
        Full suspend→resume cycle via API.
        We manually update the run to suspended state (as the execution engine would)
        then POST to /resume with the correct token.
        """
        from database import Database
        from state_machine import transition_to_running, transition_to_suspended

        wf_id = self._create_workflow(client)
        run_id = client.post(f"/workflows/{wf_id}/runs").json()["id"]

        # Simulate what the execution engine does when it hits an Input node
        # Directly via DB — normally this is done by the execution engine
        test_db = Database(":memory:")
        test_db.init_db()
        app.dependency_overrides[get_db] = lambda: test_db
        test_db.create_workflow("Flow", {})
        wf2 = test_db.create_workflow("Flow2", {})
        run2 = test_db.create_run(wf2["id"])
        ctx = {
            "node_id": "input-1",
            "prompt": "Approve?",
            "callback_token": "tok_test",
            "callback_url": "http://localhost/runs/x/resume",
            "notify_url": "http://client/notify",
        }
        test_db.update_run(run2["id"], {"status": "suspended", "suspension_context": ctx})

        r = client.post(f"/runs/{run2['id']}/resume", json={
            "value": "yes, proceed",
            "callback_token": "tok_test",
        })
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "running"

        test_db.close()
        app.dependency_overrides.clear()

    def test_resume_run_wrong_token_403(self, client):
        from database import Database
        test_db = Database(":memory:")
        test_db.init_db()
        app.dependency_overrides[get_db] = lambda: test_db

        wf = test_db.create_workflow("F", {})
        run = test_db.create_run(wf["id"])
        ctx = {
            "node_id": "input-1",
            "prompt": "Approve?",
            "callback_token": "tok_real",
            "callback_url": "url",
            "notify_url": "url2",
        }
        test_db.update_run(run["id"], {"status": "suspended", "suspension_context": ctx})

        r = client.post(f"/runs/{run['id']}/resume", json={
            "value": "answer",
            "callback_token": "WRONG",
        })
        assert r.status_code == 403

        test_db.close()
        app.dependency_overrides.clear()

    def test_resume_nonexistent_run_404(self, client):
        r = client.post("/runs/nonexistent/resume", json={
            "value": "answer",
            "callback_token": "tok",
        })
        assert r.status_code == 404
