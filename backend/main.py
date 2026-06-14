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

Phase 6 additions
-----------------
  POST /pipelines/run             — execute a pipeline; returns run_id + stream URL
  GET  /runs/{run_id}/stream      — SSE stream of execution events for a live run

Architecture
------------
The database is injected via FastAPI's dependency system (get_db). Tests override
get_db with an in-memory database for isolation. Production uses the file path from
DATABASE_URL env var (defaults to './pipeline.db').

The execution engine (engine/engine.py) is launched as an asyncio.Task by the
/pipelines/run endpoint. The task writes execution events to an asyncio.Queue
registered in _RUN_QUEUES keyed by run_id. The /runs/{id}/stream SSE endpoint
drains that queue and forwards events to the browser via EventSourceResponse.

CRUD endpoints remain synchronous (FastAPI threadpool). Only the streaming
endpoints are async — this is the exact split planned in Phase 5 decisions.md.
"""
import asyncio
import json
import os
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from dag import analyse_graph
from database import Database
from state_machine import create_run, resume_from_suspended, RunStateError
from engine.engine import execute_pipeline, EXECUTORS


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


class RunRequest(BaseModel):
    """
    Request body for POST /pipelines/run.

    nodes / edges:    The full workflow graph (same format as /pipelines/parse).
    trigger_payload:  For Webhook-triggered pipelines — the HTTP request payload
                      that the external system sent. Injected as the Webhook node's
                      output before execution begins.
    reuse_outputs:    Partial execution: {node_id: cached_output_dict}.
                      Nodes with a cache entry are skipped (cache_hit);
                      execution starts from the first node not in this dict.
    is_development:   True (default) = dev mode (inline input, no real webhooks).
    workflow_id:      Optional — if provided, the run is linked to a saved workflow.
                      If omitted, a workflow record is created on the fly.
    """
    nodes: list
    edges: list
    trigger_payload: dict = {}
    reuse_outputs: dict = {}
    is_development: bool = True
    workflow_id: str | None = None


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


# ---------------------------------------------------------------------------
# Phase 6 — Execution engine endpoints
# ---------------------------------------------------------------------------

# Server-side registry of live SSE queues: {run_id: asyncio.Queue}
# Queues are created by /pipelines/run and drained by /runs/{id}/stream.
# They are not persisted — they are ephemeral live-execution channels.
_RUN_QUEUES: dict[str, asyncio.Queue] = {}


@app.post("/pipelines/run", status_code=202)
async def run_pipeline(req: RunRequest, db: Database = Depends(get_db)):
    """
    Starts an asynchronous pipeline execution.

    Returns 202 Accepted immediately with {run_id, stream_url}.
    The caller should then subscribe to GET /runs/{run_id}/stream for live events.

    If workflow_id is provided, the run is linked to that workflow.
    If not, a temporary workflow record is created to satisfy the FK constraint.
    """
    # Resolve or create a workflow record (runs table has a FK to workflows)
    workflow_id = req.workflow_id
    if workflow_id:
        if not db.get_workflow(workflow_id):
            raise HTTPException(status_code=404, detail="Workflow not found")
    else:
        # Ad-hoc run — create a transient workflow record
        wf = db.create_workflow("Ad-hoc run", {"nodes": req.nodes, "edges": req.edges})
        workflow_id = wf["id"]

    # Create the run record
    run = db.create_run(workflow_id)
    run_id = run["id"]

    # Create the SSE queue and register it BEFORE starting the task
    # so /stream can subscribe even if the task starts instantly
    queue: asyncio.Queue = asyncio.Queue()
    _RUN_QUEUES[run_id] = queue

    # Launch engine as a background task — returns immediately
    graph = {"nodes": req.nodes, "edges": req.edges}
    asyncio.create_task(
        execute_pipeline(
            run=run,
            graph=graph,
            db=db,
            sse_queue=queue,
            reuse_outputs=req.reuse_outputs or {},
            trigger_payload=req.trigger_payload or {},
            is_development=req.is_development,
        ),
        name=f"engine-{run_id}",
    )

    return {
        "run_id": run_id,
        "stream_url": f"/runs/{run_id}/stream",
        "status": "started",
    }


@app.get("/runs/{run_id}/stream")
async def stream_run(run_id: str, db: Database = Depends(get_db)):
    """
    SSE stream of execution events for a live run.

    The client subscribes here immediately after POST /pipelines/run.
    Events are forwarded as they arrive from the engine task.
    The stream closes when the engine puts the sentinel (None) onto the queue.

    If the run is not active (already completed or no queue registered), returns 404.
    The client can still read final state via GET /runs/{run_id}.
    """
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    # For completed runs, there is no active queue — return a stub stream
    # with a single pipeline_completed event synthesised from the DB state.
    if run["status"] == "completed" and run_id not in _RUN_QUEUES:
        async def completed_stub():
            payload = json.dumps({
                "type": "pipeline_completed",
                "outputs": run["node_outputs"],
                "duration": 0,
            })
            yield {"data": payload}
        return EventSourceResponse(completed_stub())

    queue = _RUN_QUEUES.get(run_id)
    if queue is None:
        raise HTTPException(status_code=404, detail="No active stream for this run")

    async def event_generator():
        try:
            while True:
                try:
                    # 30-second timeout per event — keeps the connection alive
                    # with HTTP keep-alive even during slow nodes (like LLM calls)
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    # Send a keep-alive comment to prevent proxy timeouts
                    yield {"comment": "keep-alive"}
                    continue

                if event is None:  # DONE sentinel
                    break

                yield {"data": json.dumps(event)}

        except asyncio.CancelledError:
            # Client disconnected — clean up the queue
            pass
        finally:
            _RUN_QUEUES.pop(run_id, None)

    return EventSourceResponse(event_generator())
