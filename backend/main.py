"""
Pipeline API — FastAPI application for the pipeline builder.

Endpoints
---------
  GET  /                          — health check
  POST /pipelines/parse           — validate graph structure
  POST /workflows                 — save a new workflow definition
  GET  /workflows                 — list all saved workflows
  GET  /workflows/{id}            — get a workflow by ID
  PUT  /workflows/{id}            — update workflow name or definition
  POST /workflows/{id}/runs       — create a new run for a workflow
  GET  /runs/{run_id}             — get run state
  POST /runs/{run_id}/resume      — resume a suspended run with a human response
  POST /pipelines/run             — execute a pipeline; returns run_id + stream URL
  GET  /runs/{run_id}/stream      — SSE stream of execution events for a live run
  POST /webhook/{path}            — external webhook receiver
  PUT  /workflows/{id}/save       — save current canvas state to an existing workflow

Architecture
------------
The database is injected via FastAPI's dependency system (get_db). Tests override
get_db with an in-memory database for isolation. Production uses the file path from
DATABASE_URL env var.

The execution engine is launched as an asyncio.Task by the
/pipelines/run endpoint. The task writes execution events to an asyncio.Queue
registered in _RUN_QUEUES keyed by run_id. The /runs/{id}/stream SSE endpoint
drains that queue and forwards events to the browser via EventSourceResponse.

CRUD endpoints remain synchronous (FastAPI threadpool). Only the streaming
endpoints are async.
"""
import asyncio
import json
import os
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from dag import analyse_graph
from database import Database
from state_machine import create_run, resume_from_suspended, RunStateError
from engine.engine import execute_pipeline, EXECUTORS
from routers.ai import router as ai_router


app = FastAPI(title="Pipeline API")
app.include_router(ai_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


_db: Database | None = None


def get_db() -> Database:
    """
    Returns the singleton Database instance for the application.
    Tests override this via app.dependency_overrides.
    """
    global _db
    if _db is None:
        db_path = os.getenv("DATABASE_URL", "./pipeline.db")
        _db = Database(db_path)
        _db.init_db()
    return _db


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

    nodes / edges:    The full workflow graph.
    trigger_payload:  For Webhook-triggered pipelines — the HTTP request payload.
    reuse_outputs:    Partial execution: {node_id: cached_output_dict}.
    is_development:   True = dev mode (inline input, no real webhooks).
    workflow_id:      Optional — if provided, the run is linked to a saved workflow.
    """
    nodes: list
    edges: list
    trigger_payload: dict = {}
    reuse_outputs: dict = {}
    is_development: bool = True
    workflow_id: str | None = None


@app.get("/")
def health():
    return {"ping": "pong"}


@app.post("/pipelines/parse")
def parse_pipeline(req: ParseRequest):
    """
    Validates the pipeline graph using semantic-aware DAG analysis.

    Returns is_dag, topo_order, num_nodes, and num_edges.
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


@app.put("/workflows/{workflow_id}/save")
def save_workflow(workflow_id: str, req: WorkflowUpdate, db: Database = Depends(get_db)):
    """
    Convenience alias for PUT /workflows/{id}.
    Saves definition so the webhook receiver can find this workflow.
    """
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
async def resume_run(run_id: str, req: ResumeRequest, db: Database = Depends(get_db)):
    """
    Resumes a suspended run when a human provides a response.
    Validates the callback token before accepting.
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

    run = db.get_run(run_id)
    workflow = db.get_workflow(run["workflow_id"])
    if not workflow:
        raise HTTPException(status_code=500, detail="Workflow not found")

    definition = workflow.get("definition", {})
    queue: asyncio.Queue = asyncio.Queue()
    _RUN_QUEUES[run_id] = queue

    asyncio.create_task(
        execute_pipeline(
            run=run,
            graph={"nodes": definition.get("nodes", []), "edges": definition.get("edges", [])},
            db=db,
            sse_queue=queue,
            reuse_outputs=run["node_outputs"],
            trigger_payload={},
            is_development=True,
        ),
        name=f"engine-{run_id}",
    )

    return run


# Server-side registry of live SSE queues: {run_id: asyncio.Queue}
_RUN_QUEUES: dict[str, asyncio.Queue] = {}


@app.post("/pipelines/run", status_code=202)
async def run_pipeline(req: RunRequest, db: Database = Depends(get_db)):
    """
    Starts an asynchronous pipeline execution.

    Returns 202 Accepted immediately with {run_id, stream_url}.
    The caller should subscribe to GET /runs/{run_id}/stream for live events.
    """
    workflow_id = req.workflow_id
    if workflow_id:
        if not db.get_workflow(workflow_id):
            raise HTTPException(status_code=404, detail="Workflow not found")
    else:
        wf = db.create_workflow("Ad-hoc run", {"nodes": req.nodes, "edges": req.edges})
        workflow_id = wf["id"]

    run = db.create_run(workflow_id)
    run_id = run["id"]

    queue: asyncio.Queue = asyncio.Queue()
    _RUN_QUEUES[run_id] = queue

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
    """
    run = db.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

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
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                except asyncio.TimeoutError:
                    yield {"comment": "keep-alive"}
                    continue

                if event is None:
                    break

                yield {"data": json.dumps(event)}

        except asyncio.CancelledError:
            pass
        finally:
            _RUN_QUEUES.pop(run_id, None)

    return EventSourceResponse(event_generator())


@app.post("/webhook/{path:path}", status_code=202)
async def receive_webhook(path: str, request: Request, db: Database = Depends(get_db)):
    """
    External webhook receiver. Triggers matching saved workflow.
    """
    normalised_path = f"/{path}" if not path.startswith("/") else path

    wf = db.find_workflow_by_webhook_path(normalised_path)
    if not wf:
        raise HTTPException(
            status_code=404,
            detail=f"No saved workflow found with a Webhook node configured for path '{normalised_path}'."
        )

    try:
        trigger_payload = await request.json()
    except Exception:
        trigger_payload = {}

    definition = wf.get("definition", {})
    nodes = definition.get("nodes", [])
    edges = definition.get("edges", [])

    run = db.create_run(wf["id"])
    run_id = run["id"]

    queue: asyncio.Queue = asyncio.Queue()
    _RUN_QUEUES[run_id] = queue

    asyncio.create_task(
        execute_pipeline(
            run=run,
            graph={"nodes": nodes, "edges": edges},
            db=db,
            sse_queue=queue,
            trigger_payload=trigger_payload,
            reuse_outputs={},
            is_development=False,
        ),
        name=f"engine-{run_id}",
    )

    return {
        "run_id": run_id,
        "stream_url": f"/runs/{run_id}/stream",
        "workflow_id": wf["id"],
        "workflow_name": wf["name"],
        "status": "started",
    }
