"""
Tests for BranchExecutor — the most architecturally critical executor.

These tests verify:
  1. Correct predicate evaluation (true/false routing)
  2. Basic branch marking (linear inactive branch marked skipped)
  3. Diamond convergence — the merge node is NOT skipped
  4. Nested convergence — a node with multiple active parents is never skipped
  5. Empty inactive branch (no targets) — no nodes skipped
  6. Bad condition expression raises ValueError
  7. The context.skipped_nodes set is populated correctly
"""
import asyncio
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from engine.context import ExecutionContext
from engine.executors.branch import BranchExecutor, _eval_condition, _compute_skipped_nodes


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------------------------------------------------------------------------
# _eval_condition
# ---------------------------------------------------------------------------

class TestEvalCondition:
    def test_greater_than_true(self):
        assert _eval_condition("value > 0.7", 0.9) is True

    def test_greater_than_false(self):
        assert _eval_condition("value > 0.7", 0.5) is False

    def test_equality(self):
        assert _eval_condition("value == 'hello'", "hello") is True

    def test_string_contains(self):
        assert _eval_condition("'error' in value", "an error occurred") is True

    def test_dict_key_access(self):
        assert _eval_condition("value['score'] >= 0.8", {"score": 0.9}) is True

    def test_dict_key_in_namespace(self):
        # dict keys are injected into the namespace too
        assert _eval_condition("score > 0.5", {"score": 0.8}) is True

    def test_len_function(self):
        assert _eval_condition("len(value) > 2", [1, 2, 3]) is True

    def test_empty_expression_raises(self):
        with pytest.raises(ValueError, match="empty"):
            _eval_condition("", "anything")

    def test_invalid_expression_raises(self):
        with pytest.raises(ValueError, match="failed"):
            _eval_condition("value.nonexistent_method()", "string")

    def test_blocked_builtins(self):
        """__import__ must not be accessible."""
        with pytest.raises(ValueError):
            _eval_condition("__import__('os').system('ls')", "x")


# ---------------------------------------------------------------------------
# _compute_skipped_nodes
# ---------------------------------------------------------------------------

def make_edges_list(*edge_tuples):
    """Helper: (source, sourceHandle, target) tuples → edge dicts."""
    edges = []
    for src, src_handle, tgt in edge_tuples:
        edges.append({
            "source": src,
            "sourceHandle": src_handle,
            "target": tgt,
            "targetHandle": f"{tgt}-input",
            "data": {},
        })
    return edges


class TestComputeSkippedNodes:
    def test_linear_false_branch_skipped(self):
        """
        Condition → (false) → B → C
        Condition → (true)  → (nothing)
        condition=true: B and C should be skipped.
        """
        edges = make_edges_list(
            ("cond-1", "cond-1-false", "B"),
            ("B", "B-output", "C"),
        )
        all_nodes = {"cond-1", "B", "C"}
        skipped = _compute_skipped_nodes("cond-1", "cond-1-false", edges, all_nodes)
        assert skipped == {"B", "C"}

    def test_empty_inactive_branch(self):
        """Inactive branch has no targets — nothing to skip."""
        edges = make_edges_list(
            ("cond-1", "cond-1-true", "A"),
        )
        all_nodes = {"cond-1", "A"}
        skipped = _compute_skipped_nodes("cond-1", "cond-1-false", edges, all_nodes)
        assert skipped == set()

    def test_diamond_convergence_merge_not_skipped(self):
        """
        Condition → true  → A → Merge
        Condition → false → B → Merge
        condition=true: B is skipped. Merge is NOT skipped (A feeds it).
        """
        edges = make_edges_list(
            ("cond-1", "cond-1-true",  "A"),
            ("cond-1", "cond-1-false", "B"),
            ("A", "A-output", "Merge"),
            ("B", "B-output", "Merge"),
        )
        all_nodes = {"cond-1", "A", "B", "Merge"}
        skipped = _compute_skipped_nodes("cond-1", "cond-1-false", edges, all_nodes)
        assert "B" in skipped
        assert "Merge" not in skipped
        assert "A" not in skipped

    def test_deep_false_branch_all_skipped_when_no_merge(self):
        """
        Condition → false → B → C → D (no merge with true branch)
        condition=true: B, C, D all skipped.
        """
        edges = make_edges_list(
            ("cond-1", "cond-1-true",  "A"),
            ("cond-1", "cond-1-false", "B"),
            ("B", "B-out", "C"),
            ("C", "C-out", "D"),
        )
        all_nodes = {"cond-1", "A", "B", "C", "D"}
        skipped = _compute_skipped_nodes("cond-1", "cond-1-false", edges, all_nodes)
        assert skipped == {"B", "C", "D"}
        assert "A" not in skipped

    def test_condition_node_itself_never_skipped(self):
        """The condition node must not appear in its own skipped set."""
        edges = make_edges_list(
            ("cond-1", "cond-1-false", "B"),
        )
        all_nodes = {"cond-1", "B"}
        skipped = _compute_skipped_nodes("cond-1", "cond-1-false", edges, all_nodes)
        assert "cond-1" not in skipped


# ---------------------------------------------------------------------------
# BranchExecutor integration
# ---------------------------------------------------------------------------

def make_branch_ctx(nodes, edges, input_value, condition_expr):
    """Build an ExecutionContext wired for a Condition node test."""
    cond_node = next(n for n in nodes if n.get("type") == "condition")
    cond_id = cond_node["id"]
    upstream_id = "upstream-1"

    # Inject the condition expr into the node data
    for n in nodes:
        if n["id"] == cond_id:
            n["data"] = {"condition": condition_expr}

    ctx = ExecutionContext(
        run_id="test", workflow_id="wf",
        graph={"nodes": nodes, "edges": edges},
        node_outputs={upstream_id: {"output": input_value}},
    )
    return ctx, cond_id


class TestBranchExecutor:
    def _run_branch(self, condition_expr, input_value, downstream_nodes=None):
        """Helper: run the branch executor and return (result, skipped_nodes)."""
        cond_id = "cond-1"
        upstream_id = "upstream-1"
        a_id, b_id = "A", "B"

        nodes = [
            {"id": cond_id, "type": "condition", "data": {"condition": condition_expr}},
            {"id": upstream_id, "data": {}},
            {"id": a_id, "data": {}},
            {"id": b_id, "data": {}},
        ] + (downstream_nodes or [])

        edges = [
            # upstream → condition input
            {"source": upstream_id, "sourceHandle": f"{upstream_id}-output",
             "target": cond_id, "targetHandle": f"{cond_id}-input", "data": {}},
            # condition → true branch (A)
            {"source": cond_id, "sourceHandle": f"{cond_id}-true",
             "target": a_id, "targetHandle": f"{a_id}-input", "data": {}},
            # condition → false branch (B)
            {"source": cond_id, "sourceHandle": f"{cond_id}-false",
             "target": b_id, "targetHandle": f"{b_id}-input", "data": {}},
        ]

        ctx = ExecutionContext(
            run_id="test", workflow_id="wf",
            graph={"nodes": nodes, "edges": edges},
            node_outputs={upstream_id: {"output": input_value}},
        )

        node = {"id": cond_id, "type": "condition", "data": {"condition": condition_expr}}
        result = run(BranchExecutor().execute(node, ctx))
        return result, ctx.skipped_nodes

    def test_true_condition_skips_false_branch(self):
        result, skipped = self._run_branch("value > 5", 10)
        assert result["_branch_fired"] == "true"
        assert "B" in skipped
        assert "A" not in skipped

    def test_false_condition_skips_true_branch(self):
        result, skipped = self._run_branch("value > 5", 3)
        assert result["_branch_fired"] == "false"
        assert "A" in skipped
        assert "B" not in skipped

    def test_active_branch_value_is_passed_through(self):
        result, _ = self._run_branch("value > 5", 10)
        # The active branch ("true") carries the input value through
        assert result["true"] == 10

    def test_invalid_condition_raises(self):
        with pytest.raises(ValueError):
            self._run_branch("", 5)
