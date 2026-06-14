"""
BranchExecutor — handles Condition nodes (execution.kind = 'branch').

The Condition node evaluates a predicate against upstream data and routes
execution to either the 'true' or 'false' branch.

Predicate evaluation:
  The upstream value connected to the 'input' handle is available as 'value'
  in the evaluation namespace. We also expose 'data' as an alias.
  We use a restricted eval() with a safe whitelist.

Branch marking:
  After evaluating, the executor marks all nodes exclusively reachable through
  the inactive branch as "skipped".
"""
from __future__ import annotations

from engine.context import ExecutionContext
from engine.executors.base import ExecutorBase


# Safe builtins for predicate evaluation
_SAFE_BUILTINS = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "float": float, "int": int, "isinstance": isinstance, "len": len,
    "list": list, "max": max, "min": min, "round": round, "set": set,
    "str": str, "sum": sum, "tuple": tuple, "type": type,
    "True": True, "False": False, "None": None,
}


def _eval_condition(expression: str, value: object) -> bool:
    """
    Safely evaluates a condition expression string against a value.
    """
    if not expression or not expression.strip():
        raise ValueError("Condition expression is empty — check the Condition node's configuration")

    namespace = {
        "__builtins__": _SAFE_BUILTINS,
        "value": value,
        "data": value,
    }

    if isinstance(value, dict):
        namespace.update(value)

    try:
        result = eval(expression.strip(), namespace)  # noqa: S307
    except Exception as exc:
        raise ValueError(f"Condition evaluation failed: {exc!r} — expression: {expression!r}") from exc

    return bool(result)


def _compute_skipped_nodes(
    condition_node_id: str,
    inactive_handle_id: str,
    edges: list[dict],
    all_node_ids: set[str],
) -> set[str]:
    """
    Returns the set of node IDs that should be skipped because they are
    exclusively reachable through the inactive branch.
    """
    inactive_edge_targets = {
        e["target"]
        for e in edges
        if e.get("sourceHandle") == inactive_handle_id
        and e.get("target") in all_node_ids
    }

    if not inactive_edge_targets:
        return set()

    adjacency: dict[str, list[str]] = {n: [] for n in all_node_ids}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in adjacency and tgt in all_node_ids:
            adjacency[src].append(tgt)

    candidate_skip: set[str] = set()
    queue = list(inactive_edge_targets)
    while queue:
        current = queue.pop(0)
        if current in candidate_skip:
            continue
        candidate_skip.add(current)
        for neighbour in adjacency.get(current, []):
            if neighbour not in candidate_skip:
                queue.append(neighbour)

    reverse_adj: dict[str, set[str]] = {n: set() for n in all_node_ids}
    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in all_node_ids and tgt in all_node_ids:
            reverse_adj[tgt].add(src)

    changed = True
    while changed:
        changed = False
        for node_id in list(candidate_skip):
            parents = reverse_adj.get(node_id, set())
            active_parents = parents - candidate_skip - {condition_node_id}
            if active_parents:
                candidate_skip.discard(node_id)
                changed = True

    return candidate_skip


class BranchExecutor(ExecutorBase):
    """
    Evaluates the condition expression and marks inactive branch nodes as skipped.
    """

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        condition_expr = data.get("condition", "")
        input_value = ctx.get_input(node_id, "input")

        result = _eval_condition(condition_expr, input_value)
        active_branch = "true" if result else "false"
        inactive_branch = "false" if result else "true"

        inactive_handle_key = f"{node_id}-{inactive_branch}"
        all_node_ids = {n["id"] for n in ctx.graph.get("nodes", [])}
        edges = ctx.graph.get("edges", [])

        skipped = _compute_skipped_nodes(
            condition_node_id=node_id,
            inactive_handle_id=inactive_handle_key,
            edges=edges,
            all_node_ids=all_node_ids,
        )
        ctx.skipped_nodes.update(skipped)

        return {
            "result": result,
            active_branch: input_value,
            "dataType": "boolean",
            "_branch_fired": active_branch,
        }
