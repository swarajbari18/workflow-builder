"""
Run state machine — pure transition functions.

Implements the state diagram from DESIGN-VISION.md Decision 4:

  created
    ↓ (execution starts)
  running
    ↓ (Input node reached, webhook fired)
  suspended ──→ (response within timeout) ──→ running
    ↓ (timeout)
  timed_out ──→ (late response OR operator) ──→ running

  running ──→ completed
  running ──→ error
  suspended ──→ error

The key architectural guarantee: timed_out is NOT failed. Its state is intact.
Any transition function raises RunStateError for invalid transitions so callers
can surface the right HTTP error (409 Conflict) without checking state themselves.

All functions accept a run dict and return a NEW run dict — never mutating the
input. The caller (database.py) persists the returned dict.

These functions have no I/O. Tests call them directly without HTTP or DB setup.
Phase 6's execution engine calls transition_to_suspended, transition_to_completed,
and transition_to_error as nodes complete.
"""
from __future__ import annotations
import uuid
from datetime import datetime, timezone


VALID_STATUSES = frozenset({"created", "running", "suspended", "timed_out", "completed", "error"})
_TERMINAL_STATUSES = frozenset({"completed", "error"})

# Which statuses can transition to 'running' (or 'running' again via resume)
_CAN_START_RUNNING = frozenset({"created", "suspended", "timed_out"})
_CAN_SUSPEND = frozenset({"running"})
_CAN_TIME_OUT = frozenset({"suspended"})
_CAN_COMPLETE = frozenset({"running"})
_CAN_ERROR = frozenset({"running", "suspended"})
_CAN_RESUME = frozenset({"suspended", "timed_out"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class RunStateError(ValueError):
    """Raised when a state transition is not permitted from the current status."""


def _require(run: dict, allowed: frozenset[str]) -> None:
    if run["status"] not in allowed:
        raise RunStateError(
            f"Cannot transition from '{run['status']}' — allowed from: {sorted(allowed)}"
        )


def create_run(workflow_id: str) -> dict:
    """
    Creates a new run dict in 'created' status.
    The caller passes it to database.py for persistence before starting execution.
    """
    return {
        "id": str(uuid.uuid4()),
        "workflow_id": workflow_id,
        "status": "created",
        "current_node_id": None,
        "node_outputs": {},
        "global_state": {"messages": [], "variables": {}},
        "suspension_context": None,
        "callback_token": None,
        "created_at": _now_iso(),
        "suspended_at": None,
        "completed_at": None,
        "error": None,
    }


def transition_to_running(run: dict) -> dict:
    """Moves a run from created/suspended/timed_out into running."""
    _require(run, _CAN_START_RUNNING)
    return {**run, "status": "running"}


def transition_to_suspended(run: dict, suspension_context: dict) -> dict:
    """
    Halts execution at an Input node. Stores the suspension context so the
    execution engine can resume from the exact node when the response arrives.

    suspension_context must contain:
      node_id, prompt, callback_token, callback_url, notify_url
    """
    _require(run, _CAN_SUSPEND)
    return {
        **run,
        "status": "suspended",
        "suspension_context": suspension_context,
        "suspended_at": _now_iso(),
    }


def transition_to_timed_out(run: dict) -> dict:
    """
    Called by a background timeout job when no response arrives within the
    configured window. The run is NOT failed — it can still be resumed.
    """
    _require(run, _CAN_TIME_OUT)
    return {**run, "status": "timed_out"}


def transition_to_completed(run: dict, final_node_outputs: dict) -> dict:
    """
    All nodes finished successfully. Stores the final node outputs and timestamps.
    completed is a terminal state — no further transitions allowed.
    """
    _require(run, _CAN_COMPLETE)
    return {
        **run,
        "status": "completed",
        "node_outputs": final_node_outputs,
        "completed_at": _now_iso(),
    }


def transition_to_error(run: dict, error: dict) -> dict:
    """
    A node executor raised an unrecoverable error. Stores the error context.
    error is a terminal state.
    """
    _require(run, _CAN_ERROR)
    return {**run, "status": "error", "error": error}


def resume_from_suspended(run: dict, value: str, callback_token: str) -> dict:
    """
    Called when a human provides a response to a suspended Input node.
    Validates the callback token, stores the response as the Input node's output
    value, and transitions to running so execution continues from that node.

    Accepts both 'suspended' and 'timed_out' runs — a late response is valid.

    Raises RunStateError if the token is wrong (prevents spoofed resumptions)
    or if the run is not in a resumable state.
    """
    _require(run, _CAN_RESUME)

    ctx = run.get("suspension_context") or {}
    stored_token = ctx.get("callback_token")
    if stored_token != callback_token:
        raise RunStateError(f"Invalid callback token — resumption rejected")

    node_id = ctx.get("node_id")
    updated_outputs = {
        **run.get("node_outputs", {}),
        node_id: {"value": value, "dataType": "string"},
    }
    running_run = transition_to_running({**run, "node_outputs": updated_outputs})
    return {**running_run, "suspension_context": None}


if __name__ == "__main__":
    # Smoke block — run through a full suspend/resume cycle.
    run = create_run("wf-smoke-1")
    print(f"created:   {run['status']} id={run['id']}")

    run = transition_to_running(run)
    print(f"running:   {run['status']}")

    ctx = {
        "node_id": "input-1",
        "prompt": "Should I delete?",
        "callback_token": "tok_smoke",
        "callback_url": "http://localhost/runs/x/resume",
        "notify_url": "http://client/notify",
    }
    run = transition_to_suspended(run, ctx)
    print(f"suspended: {run['status']} at={run['suspended_at']}")

    run = transition_to_timed_out(run)
    print(f"timed_out: {run['status']}")

    run = resume_from_suspended(run, "yes, proceed", "tok_smoke")
    print(f"resumed:   {run['status']} input_value={run['node_outputs']['input-1']['value']}")

    run = transition_to_completed(run, {**run["node_outputs"], "output-1": {"value": "done"}})
    print(f"completed: {run['status']} at={run['completed_at']}")

    # Verify terminal state blocks further transitions
    try:
        transition_to_running(run)
    except RunStateError as e:
        print(f"✓ terminal state guarded: {e}")
