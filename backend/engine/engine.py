"""
Execution engine — the orchestrator.

execute_pipeline() is the single entry point for running a workflow.
It orchestrates:
  1. DAG validation and topo sort
  2. ExecutionContext construction
  3. Node-by-node execution with durable DB checkpointing after each node
  4. SSE event emission throughout
  5. Suspension handling (Input nodes)
  6. Error handling (node failures transition run to error state)
  7. Partial re-execution (reuse_outputs cache skip)

Architecture contract:
  - This function is an async coroutine launched via asyncio.create_task() by the
    SSE endpoint. It puts events onto ctx.sse_queue; the endpoint drains them.
  - It writes to the database after EVERY node via asyncio.to_thread() (non-blocking).
  - When it finishes (completed, error, or suspended), it puts SENTINEL (None) onto
    the queue so the SSE stream knows to close.
  - If the SSE client disconnects, the Task is cancelled. The cancellation propagates
    into this coroutine as asyncio.CancelledError at the next await point.

The executor registry is built here and injected into LoopExecutor.
"""
from __future__ import annotations
import asyncio
import time
from typing import Any

from dag import analyse_graph
from database import Database
from state_machine import (
    transition_to_running,
    transition_to_completed,
    transition_to_suspended,
    transition_to_error,
    RunStateError,
)

from engine.context import ExecutionContext
from engine.events import (
    node_started, node_completed, node_skipped, node_error as ev_node_error,
    node_output, pipeline_completed, execution_suspended, execution_error,
)
from engine.executors.base import SuspendExecution, ExecutorBase
from engine.executors.emit import EmitExecutor
from engine.executors.template import TemplateExecutor
from engine.executors.output import OutputExecutor
from engine.executors.branch import BranchExecutor
from engine.executors.loop import LoopExecutor
from engine.executors.input_node import InputExecutor
from engine.executors.llm import LLMExecutor
from engine.executors.http_request import HTTPExecutor
from engine.executors.script import ScriptExecutor


# ---------------------------------------------------------------------------
# Executor registry — the sole join point between frontend and backend.
# Key = execution.kind string from nodeSpecs.js.
# ---------------------------------------------------------------------------

EXECUTORS: dict[str, type[ExecutorBase]] = {
    "suspend":      InputExecutor,
    "emit":         EmitExecutor,
    "template":     TemplateExecutor,
    "llm-call":     LLMExecutor,
    "branch":       BranchExecutor,
    "loop":         LoopExecutor,
    "http-request": HTTPExecutor,
    "code-sandbox": ScriptExecutor,
    "display":      OutputExecutor,
}

# Inject registry into LoopExecutor so it can dispatch body nodes
LoopExecutor.executor_registry = EXECUTORS

# Sentinel value placed on the SSE queue when the engine terminates
_DONE_SENTINEL = None


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _find_node(nodes: list[dict], node_id: str) -> dict | None:
    for n in nodes:
        if n.get("id") == node_id:
            return n
    return None


def _get_execution_kind(node: dict) -> str:
    """
    Reads the execution.kind from a node.

    The node dict from the frontend has the form:
      { id, type, data: { execution: { kind: "template", ... }, field1: ..., ... } }

    The 'execution' sub-object lives inside 'data' because React Flow serialises
    the NodeSpec's execution field into the node's data when the graph is submitted.
    """
    data = node.get("data", {})
    execution = data.get("execution", {})
    return execution.get("kind", "")


async def _db_write(db: Database, run_id: str, fields: dict) -> None:
    """
    Writes to the DB without blocking the event loop.
    The DB class is synchronous (sqlite3); we offload it to a thread.
    """
    await asyncio.to_thread(db.update_run, run_id, fields)


# ---------------------------------------------------------------------------
# Main engine
# ---------------------------------------------------------------------------

async def execute_pipeline(
    run: dict,
    graph: dict,
    db: Database,
    sse_queue: asyncio.Queue,
    *,
    reuse_outputs: dict | None = None,
    trigger_payload: dict | None = None,
    is_development: bool = True,
) -> None:
    """
    Executes a pipeline run end-to-end.

    Args:
        run:             The run dict from the database (status must be 'created')
        graph:           The workflow graph: {nodes: [...], edges: [...]}
        db:              The database instance for checkpointing
        sse_queue:       Events are put here; the SSE endpoint drains and streams them
        reuse_outputs:   Optional cached outputs for partial re-execution (Run from here)
        trigger_payload: For Webhook trigger nodes — the HTTP request body to inject
        is_development:  True = dev mode (inline input, verbose events)

    Returns:
        None. Puts _DONE_SENTINEL onto sse_queue when finished (regardless of outcome).
    """
    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    run_id = run["id"]

    try:
        # ------------------------------------------------------------------
        # 1. Validate and sort the graph
        # ------------------------------------------------------------------
        analysis = analyse_graph(nodes, edges)
        if not analysis.is_dag:
            await sse_queue.put(execution_error(
                "Graph contains a cycle — remove the cyclic connection and try again",
            ))
            return

        topo_order = analysis.topo_order  # outer nodes only
        subgraph_members = set(analysis.subgraph_members)

        # ------------------------------------------------------------------
        # 2. Transition run to 'running' and write to DB
        # ------------------------------------------------------------------
        run = transition_to_running(run)
        await _db_write(db, run_id, {"status": "running"})

        # ------------------------------------------------------------------
        # 3. Build execution context
        # ------------------------------------------------------------------
        # Merge reuse_outputs (from partial execution) into starting node_outputs.
        # Trigger payload is pre-seeded for webhook nodes.
        initial_outputs: dict = dict(reuse_outputs or {})

        # Inject webhook payload into the trigger node's output slot
        if trigger_payload:
            trigger_nodes = [n for n in nodes if n.get("type") in ("webhook", "customInput")]
            for tn in trigger_nodes:
                tn_id = tn["id"]
                if tn_id not in initial_outputs:
                    initial_outputs[tn_id] = {"value": trigger_payload, "payload": trigger_payload, "dataType": "json"}

        ctx = ExecutionContext(
            run_id=run_id,
            workflow_id=run["workflow_id"],
            node_outputs=initial_outputs,
            global_state=run.get("global_state", {"messages": [], "variables": {}}),
            skipped_nodes=set(),
            completed_nodes=set(reuse_outputs.keys()) if reuse_outputs else set(),
            sse_queue=sse_queue,
            is_development=is_development,
            graph=graph,
            subgraph_members=subgraph_members,
        )

        pipeline_start = time.monotonic()

        # ------------------------------------------------------------------
        # 4. Execute nodes in topological order
        # ------------------------------------------------------------------
        for node_id in topo_order:
            node = _find_node(nodes, node_id)
            if node is None:
                continue  # ghost node ID — shouldn't happen, defensive skip

            # Skip: cached (partial execution)
            if node_id in ctx.completed_nodes and node_id in ctx.node_outputs:
                await ctx.emit(node_skipped(node_id, reason="cache_hit"))
                continue

            # Skip: inactive branch (Condition executor marked this)
            if node_id in ctx.skipped_nodes:
                await ctx.emit(node_skipped(node_id, reason="branch_inactive"))
                continue

            # Dispatch to the correct executor
            kind = _get_execution_kind(node)
            executor_cls = EXECUTORS.get(kind)

            if executor_cls is None:
                err_msg = (
                    f"No executor registered for execution.kind={kind!r} on node {node_id!r}. "
                    f"Check the node's spec or register the executor in engine.py."
                )
                await ctx.emit(ev_node_error(node_id, err_msg))
                run = transition_to_error(run, {"message": err_msg, "node_id": node_id})
                await _db_write(db, run_id, {"status": "error", "error": run["error"]})
                return

            # Execute
            node_start = time.monotonic()
            await ctx.emit(node_started(node_id))

            try:
                output = await executor_cls().execute(node, ctx)

            except SuspendExecution as suspend:
                # Input node reached — save state and halt
                suspension_ctx = {
                    "node_id": suspend.node_id,
                    "prompt": suspend.prompt,
                    "callback_token": suspend.callback_token,
                    "callback_url": f"/runs/{run_id}/resume",
                    "notify_url": suspend.notify_url,
                    "notified_at": _iso_now(),
                }
                await ctx.emit(execution_suspended(suspend.node_id, suspend.prompt))

                run = transition_to_suspended(run, suspension_ctx)
                await _db_write(db, run_id, {
                    "status": "suspended",
                    "current_node_id": node_id,
                    "suspension_context": suspension_ctx,
                    "node_outputs": ctx.node_outputs,
                    "global_state": ctx.global_state,
                })
                # Do not put sentinel — the run is suspended, not done.
                # The SSE stream will close when the client sees execution_suspended.
                return

            except Exception as exc:
                duration = time.monotonic() - node_start
                err_msg = str(exc)
                await ctx.emit(ev_node_error(node_id, err_msg))

                run = transition_to_error(run, {"message": err_msg, "node_id": node_id})
                await _db_write(db, run_id, {
                    "status": "error",
                    "error": run["error"],
                    "current_node_id": node_id,
                    "node_outputs": ctx.node_outputs,
                })
                return

            # Node succeeded — checkpoint
            duration = time.monotonic() - node_start
            ctx.node_outputs[node_id] = output
            ctx.completed_nodes.add(node_id)

            await ctx.emit(node_completed(node_id, duration))

            # Emit the node's primary output (for the frontend's data inspector)
            primary_value = output.get("value", output.get("output", output.get("response")))
            data_type = output.get("dataType", "any")
            await ctx.emit(node_output(node_id, primary_value, data_type))

            # Checkpoint to DB after every node
            await _db_write(db, run_id, {
                "current_node_id": node_id,
                "node_outputs": ctx.node_outputs,
                "global_state": ctx.global_state,
            })

        # ------------------------------------------------------------------
        # 5. All nodes processed — complete the run
        # ------------------------------------------------------------------
        pipeline_duration = time.monotonic() - pipeline_start
        run = transition_to_completed(run, ctx.node_outputs)
        await _db_write(db, run_id, {
            "status": "completed",
            "completed_at": run["completed_at"],
            "node_outputs": ctx.node_outputs,
        })

        await ctx.emit(pipeline_completed(ctx.node_outputs, pipeline_duration))

    except asyncio.CancelledError:
        # SSE client disconnected — mark the run as error (execution was cut short)
        try:
            run = transition_to_error(run, {"message": "Execution cancelled — client disconnected"})
            await asyncio.to_thread(db.update_run, run_id, {"status": "error", "error": run["error"]})
        except (RunStateError, Exception):
            pass  # run may already be in a terminal state
        raise  # re-raise so the Task is properly cancelled

    finally:
        # Always signal the SSE stream that we're done, whether success or failure
        await sse_queue.put(_DONE_SENTINEL)


def _iso_now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
