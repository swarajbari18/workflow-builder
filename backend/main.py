"""
Pipeline API — FastAPI application for the pipeline builder.

Endpoints
---------
  GET  /                          — health check
  POST /pipelines/parse           — validate graph structure, return is_dag + topo_order
  POST /workflows                 — save a new workflow definition
  GET  /workflows                 — list all saved workflows
  GET  /workflows/{id}            — get a workflow by ID
  PUT  /workflows/{id}            — update workflow name or definition
  POST /workflows/{id}/runs       — create a new run for a workflow
  GET  /runs/{run_id}             — get run state
  POST /runs/{run_id}/resume      — resume a suspended run with a human response

Architecture
------------
The database is injected via FastAPI's dependency system (get_db). Tests override
get_db with an in-memory database for isolation. Production uses the file path from
DATABASE_URL env var (defaults to './pipeline.db').

The state machine functions (state_machine.py) are called directly from endpoints —
they are pure functions, not HTTP-only. Phase 6's execution engine calls them the
same way, without going through HTTP.
"""
import os
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dag import analyse_graph
from database import Database
from state_machine import create_run, resume_from_suspended, RunStateError


# ---------------------------------------------------------------------------
# App + CORS
# ---------------------------------------------------------------------------

app = FastAPI(title="Pipeline API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Database dependency
# ---------------------------------------------------------------------------

_db: Database | None = None


def get_db() -> Database:
    """
    Returns the singleton Database instance for the application.
    Tests override this via app.dependency_overrides[get_db] = lambda: in_memory_db.
    """
    global _db
    if _db is None:
        db_path = os.getenv("DATABASE_URL", "./pipeline.db")
        _db = Database(db_path)
        _db.init_db()
    return _db


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ParseRequest(BaseModel):
    nodes: list
    edges: list


class WorkflowCreate(BaseModel):
    name: str
    definition: dict = {}


class WorkflowUpdate(BaseModel):
    name: str | None = None
    definition: dict | None = None


class ResumeRequest(BaseModel):
    value: str
    callback_token: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/")
def health():
    return {"ping": "pong"}


@app.post("/pipelines/parse")
def parse_pipeline(req: ParseRequest):
    """
    Validates the pipeline graph using semantic-aware DAG analysis.

    Returns is_dag (bool), topo_order (execution order for outer graph nodes),
    num_nodes, and num_edges. The topo_order is what the execution engine uses
    to determine which node to run next — it is the same algorithm both endpoints share.
    """
    result = analyse_graph(req.nodes, req.edges)
    return {
        "is_dag": result.is_dag,
        "topo_order": result.topo_order,
        "subgraph_members": result.subgraph_members,
        "tool_nodes": result.tool_nodes,
        "cycle_nodes": result.cycle_nodes,
        "cycle_back_edge_sources": result.cycle_back_edge_sources,
        "num_nodes": result.num_nodes,
        "num_edges": result.num_edges,
    }


@app.post("/workflows", status_code=201)
def create_workflow(req: WorkflowCreate, db: Database = Depends(get_db)):
    return db.create_workflow(req.name, req.definition)


@app.get("/workflows")
def list_workflows(db: Database = Depends(get_db)):
    return db.list_workflows()


@app.get("/workflows/{workflow_id}")
def get_workflow(workflow_id: str, db: Database = Depends(get_db)):
    wf = db.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@app.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: str, req: WorkflowUpdate, db: Database = Depends(get_db)):
    updated = db.update_workflow(workflow_id, name=req.name, definition=req.definition)
    if not updated:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return updated


@app.post("/workflows/{workflow_id}/runs", status_code=201)
def create_run_for_workflow(workflow_id: str, db: Database = Depends(get_db)):
    if not db.get_workflow(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found")
    return db.create_run(workflow_id)


@app.get("/runs/{run_id}")
def get_run(run_id: str, db: Database = Depends(get_db)):
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@app.post("/runs/{run_id}/resume")
def resume_run(run_id: str, req: ResumeRequest, db: Database = Depends(get_db)):
    """
    Resumes a suspended (or timed-out) run when a human provides a response.
    Validates the callback token before accepting — invalid tokens return 403.
    The execution engine (Phase 6) picks up the 'running' run and continues
    execution from the Input node whose output was just populated.
    """
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        updated_run = resume_from_suspended(run, req.value, req.callback_token)
    except RunStateError as e:
        err_msg = str(e)
        if "token" in err_msg.lower():
            raise HTTPException(status_code=403, detail="Invalid callback token")
        raise HTTPException(status_code=409, detail=err_msg)
    db.update_run(run_id, {
        "status": updated_run["status"],
        "node_outputs": updated_run["node_outputs"],
        "suspension_context": updated_run["suspension_context"],
    })
    return db.get_run(run_id)
