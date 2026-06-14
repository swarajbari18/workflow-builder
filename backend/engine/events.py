"""
SSE event definitions for the execution engine.

Every event the engine emits passes through this module. The schema here IS
the contract that Phase 8 (frontend) will subscribe to — it is documented in
the knowledge-base and must not change without a corresponding frontend update.

Design note: events are plain dicts, not dataclasses, because they get
JSON-serialised directly into the SSE stream. Keeping them as dicts avoids
a double-serialisation step (dataclass → dict → JSON) and makes the
factory functions self-documenting.

Every event has at minimum a "type" key. Timestamp fields use ISO-8601 UTC
(the same convention as the rest of the backend). Duration fields are floats
in seconds.
"""
from __future__ import annotations
import time
from datetime import datetime, timezone


# ---------------------------------------------------------------------------
# Type alias
# ---------------------------------------------------------------------------

SSEEvent = dict  # {type: str, ...}


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------------------
# Event factories — one function per event type
# ---------------------------------------------------------------------------

def node_started(node_id: str) -> SSEEvent:
    """Emitted immediately before a node executor begins."""
    return {"type": "node_started", "nodeId": node_id, "timestamp": _now_iso()}


def node_completed(node_id: str, duration_s: float) -> SSEEvent:
    """Emitted after a node executor returns successfully."""
    return {
        "type": "node_completed",
        "nodeId": node_id,
        "duration": round(duration_s, 4),
        "timestamp": _now_iso(),
    }


def node_skipped(node_id: str, reason: str = "branch_inactive") -> SSEEvent:
    """
    Emitted when the engine skips a node. Two cases:
    - reason="branch_inactive"  → Condition branch was not taken
    - reason="cache_hit"        → Partial execution: node output reused from cache
    """
    return {"type": "node_skipped", "nodeId": node_id, "reason": reason}


def node_error(node_id: str, error_message: str, error_code: str | None = None) -> SSEEvent:
    """Emitted when a node executor raises an exception."""
    payload: SSEEvent = {"type": "node_error", "nodeId": node_id, "error": {"message": error_message}}
    if error_code:
        payload["error"]["code"] = error_code
    return payload


def node_output(node_id: str, output: object, data_type: str) -> SSEEvent:
    """
    Emitted after node_completed, carrying the node's output value.
    The frontend caches this in its node-output store and uses it for
    edge type colouring and the data inspector panel.
    """
    return {
        "type": "node_output",
        "nodeId": node_id,
        "output": output,
        "dataType": data_type,
    }


def token(node_id: str, tok: str) -> SSEEvent:
    """
    Emitted per LLM token during streaming. The frontend appends each token
    to the LLM node's live output display, creating the typewriter effect.
    Phase 6: not emitted (LLM executor is a stub). Defined here for Phase 7.
    """
    return {"type": "token", "nodeId": node_id, "token": tok}


def node_progress(node_id: str, i: int, total: int, item: object) -> SSEEvent:
    """
    Emitted by the Loop executor on each iteration. The frontend updates
    the loop node's live iteration counter (i / total) and shows item preview.
    """
    return {
        "type": "node_progress",
        "nodeId": node_id,
        "data": {"i": i, "total": total, "item": item},
    }


def pipeline_completed(outputs: dict, duration_s: float) -> SSEEvent:
    """
    Final event. Carries the complete node_outputs dict so the frontend can
    update all output caches in one shot even if it missed individual node_output events.
    """
    return {
        "type": "pipeline_completed",
        "outputs": outputs,
        "duration": round(duration_s, 4),
    }


def execution_suspended(node_id: str, prompt: str) -> SSEEvent:
    """
    Emitted when an Input node halts execution. The frontend renders the
    inline response field inside that node on the canvas.
    """
    return {"type": "execution_suspended", "nodeId": node_id, "prompt": prompt}


def execution_error(error_message: str, node_id: str | None = None) -> SSEEvent:
    """
    Emitted when the engine itself (not a specific node) encounters a fatal error —
    e.g. the graph contains a cycle, or the DB write fails unrecoverably.
    """
    event: SSEEvent = {"type": "execution_error", "error": {"message": error_message}}
    if node_id:
        event["nodeId"] = node_id
    return event
