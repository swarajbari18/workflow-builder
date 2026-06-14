"""
SSE event definitions for the execution engine.

Every event the engine emits passes through this module.
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
    Emitted when the engine skips a node.
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
    """
    return {
        "type": "node_output",
        "nodeId": node_id,
        "output": output,
        "dataType": data_type,
    }


def token(node_id: str, tok: str) -> SSEEvent:
    """
    Emitted per LLM token during streaming.
    """
    return {"type": "token", "nodeId": node_id, "token": tok}


def node_progress(node_id: str, i: int, total: int, item: object) -> SSEEvent:
    """
    Emitted by the Loop executor on each iteration.
    """
    return {
        "type": "node_progress",
        "nodeId": node_id,
        "data": {"i": i, "total": total, "item": item},
    }


def pipeline_completed(outputs: dict, duration_s: float) -> SSEEvent:
    """
    Final event. Carries the complete node_outputs dict.
    """
    return {
        "type": "pipeline_completed",
        "outputs": outputs,
        "duration": round(duration_s, 4),
    }


def execution_suspended(node_id: str, prompt: str) -> SSEEvent:
    """
    Emitted when an Input node halts execution.
    """
    return {"type": "execution_suspended", "nodeId": node_id, "prompt": prompt}


def execution_error(error_message: str, node_id: str | None = None) -> SSEEvent:
    """
    Emitted when the engine itself encounters a fatal error.
    """
    event: SSEEvent = {"type": "execution_error", "error": {"message": error_message}}
    if node_id:
        event["nodeId"] = node_id
    return event
