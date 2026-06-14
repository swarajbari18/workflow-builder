"""
State machine tests — pure function transitions, no HTTP, no DB.

The state machine functions take a run dict and return a new run dict.
They never mutate in place. Every test creates a minimal run object,
applies a transition, and asserts the new state.

Run: pytest tests/test_state_machine.py -v
"""
import pytest
from datetime import datetime, timezone
from state_machine import (
    create_run,
    transition_to_running,
    transition_to_suspended,
    transition_to_timed_out,
    transition_to_completed,
    transition_to_error,
    resume_from_suspended,
    RunStateError,
    VALID_STATUSES,
)


def base_run(status: str = "created") -> dict:
    return {
        "id": "run-test-1",
        "workflow_id": "wf-1",
        "status": status,
        "current_node_id": None,
        "node_outputs": {},
        "global_state": {"messages": [], "variables": {}},
        "suspension_context": None,
        "callback_token": None,
        "created_at": "2026-06-14T10:00:00Z",
        "suspended_at": None,
        "completed_at": None,
        "error": None,
    }


class TestCreateRun:
    def test_creates_run_with_created_status(self):
        run = create_run("wf-abc")
        assert run["status"] == "created"
        assert run["workflow_id"] == "wf-abc"
        assert run["node_outputs"] == {}
        assert run["global_state"] == {"messages": [], "variables": {}}
        assert run["id"]  # has an id

    def test_each_run_gets_unique_id(self):
        r1 = create_run("wf-1")
        r2 = create_run("wf-1")
        assert r1["id"] != r2["id"]


class TestTransitionToRunning:
    def test_created_transitions_to_running(self):
        run = transition_to_running(base_run("created"))
        assert run["status"] == "running"

    def test_suspended_can_transition_to_running(self):
        run = transition_to_running(base_run("suspended"))
        assert run["status"] == "running"

    def test_timed_out_can_transition_to_running(self):
        run = transition_to_running(base_run("timed_out"))
        assert run["status"] == "running"

    def test_completed_cannot_transition_to_running(self):
        with pytest.raises(RunStateError):
            transition_to_running(base_run("completed"))

    def test_error_cannot_transition_to_running(self):
        with pytest.raises(RunStateError):
            transition_to_running(base_run("error"))

    def test_does_not_mutate_original(self):
        original = base_run("created")
        result = transition_to_running(original)
        assert original["status"] == "created"
        assert result["status"] == "running"


class TestTransitionToSuspended:
    def test_running_transitions_to_suspended(self):
        ctx = {
            "node_id": "input-1",
            "prompt": "Should I proceed?",
            "callback_token": "tok_abc",
            "callback_url": "http://backend/runs/run-1/resume",
            "notify_url": "http://client/webhook",
        }
        run = transition_to_suspended(base_run("running"), ctx)
        assert run["status"] == "suspended"
        assert run["suspension_context"] == ctx
        assert run["suspended_at"] is not None

    def test_non_running_cannot_suspend(self):
        with pytest.raises(RunStateError):
            transition_to_suspended(base_run("created"), {})

    def test_suspension_context_stored(self):
        ctx = {"node_id": "inp-2", "prompt": "Approve?", "callback_token": "tok_xyz",
               "callback_url": "url", "notify_url": "url2"}
        run = transition_to_suspended(base_run("running"), ctx)
        assert run["suspension_context"]["callback_token"] == "tok_xyz"


class TestTransitionToTimedOut:
    def test_suspended_transitions_to_timed_out(self):
        run = transition_to_timed_out(base_run("suspended"))
        assert run["status"] == "timed_out"

    def test_running_cannot_time_out_directly(self):
        with pytest.raises(RunStateError):
            transition_to_timed_out(base_run("running"))


class TestTransitionToCompleted:
    def test_running_transitions_to_completed(self):
        outputs = {"output-1": {"value": "done", "dataType": "string"}}
        run = transition_to_completed(base_run("running"), outputs)
        assert run["status"] == "completed"
        assert run["node_outputs"] == outputs
        assert run["completed_at"] is not None

    def test_non_running_cannot_complete(self):
        with pytest.raises(RunStateError):
            transition_to_completed(base_run("suspended"), {})


class TestTransitionToError:
    def test_running_transitions_to_error(self):
        err = {"message": "Script crashed", "node_id": "script-1", "code": 500}
        run = transition_to_error(base_run("running"), err)
        assert run["status"] == "error"
        assert run["error"] == err

    def test_suspended_can_error(self):
        run = transition_to_error(base_run("suspended"), {"message": "timeout expired"})
        assert run["status"] == "error"

    def test_completed_cannot_error(self):
        with pytest.raises(RunStateError):
            transition_to_error(base_run("completed"), {})


class TestResumeFromSuspended:
    def test_valid_token_resumes(self):
        ctx = {
            "node_id": "input-1",
            "prompt": "Approve?",
            "callback_token": "tok_secret",
            "callback_url": "url",
            "notify_url": "url2",
        }
        suspended_run = {**base_run("suspended"), "suspension_context": ctx}
        resumed = resume_from_suspended(suspended_run, "the user's answer", "tok_secret")
        assert resumed["status"] == "running"
        # The response value should be stored so the execution engine can read it
        assert resumed["node_outputs"]["input-1"]["value"] == "the user's answer"

    def test_invalid_token_raises(self):
        ctx = {
            "node_id": "input-1",
            "prompt": "Approve?",
            "callback_token": "tok_secret",
            "callback_url": "url",
            "notify_url": "url2",
        }
        suspended_run = {**base_run("suspended"), "suspension_context": ctx}
        with pytest.raises(RunStateError, match="token"):
            resume_from_suspended(suspended_run, "answer", "WRONG_TOKEN")

    def test_non_suspended_cannot_resume(self):
        with pytest.raises(RunStateError):
            resume_from_suspended(base_run("running"), "answer", "tok")

    def test_timed_out_can_resume_with_correct_token(self):
        """A run that timed out can still receive a late response."""
        ctx = {
            "node_id": "input-1",
            "prompt": "Still waiting",
            "callback_token": "tok_late",
            "callback_url": "url",
            "notify_url": "url2",
        }
        timed_out_run = {**base_run("timed_out"), "suspension_context": ctx}
        resumed = resume_from_suspended(timed_out_run, "late answer", "tok_late")
        assert resumed["status"] == "running"


class TestImmutability:
    def test_all_transitions_return_new_dict(self):
        r1 = base_run("created")
        r2 = transition_to_running(r1)
        assert r1 is not r2

    def test_node_outputs_not_shared(self):
        r1 = base_run("running")
        r2 = transition_to_completed(r1, {"out-1": {"value": "x"}})
        assert r1["node_outputs"] == {}
        assert r2["node_outputs"] == {"out-1": {"value": "x"}}
