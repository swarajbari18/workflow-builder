"""
LoopExecutor — handles Repeat nodes (execution.kind = 'loop').

The Repeat node iterates a collection and runs its body subgraph once per item.
From the outer graph's perspective it's a black box: inputs → outputs.
Internally, it drives a sub-execution loop.

Architecture:
  The loop node has:
    Input handle 'collection': the array to iterate.
    Output handle 'item': connects to body subgraph nodes.
    Output handle 'results': the array of each iteration's final output.
    Output handle 'done': a signal that the loop completed.

Sub-execution isolation:
  Each iteration gets a FRESH mini-context for node_outputs.
  It shares the parent's global_state.
"""
from __future__ import annotations
import time

from engine.context import ExecutionContext
from engine.events import node_progress, node_started, node_completed, node_error
from engine.executors.base import ExecutorBase


_DEFAULT_MAX_ITERATIONS = 100


def _topo_sort_body(body_node_ids: set[str], edges: list[dict]) -> list[str]:
    """
    Topologically sorts the body subgraph nodes for sub-execution.
    """
    body_ids = set(body_node_ids)
    internal_edges = [
        e for e in edges
        if e.get("source") in body_ids and e.get("target") in body_ids
    ]

    in_degree: dict[str, int] = {n: 0 for n in body_ids}
    adjacency: dict[str, list[str]] = {n: [] for n in body_ids}
    for e in internal_edges:
        src, tgt = e["source"], e["target"]
        adjacency[src].append(tgt)
        in_degree[tgt] += 1

    queue = [n for n, deg in in_degree.items() if deg == 0]
    order: list[str] = []
    while queue:
        current = queue.pop(0)
        order.append(current)
        for neighbour in adjacency[current]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    return order


async def _execute_subgraph(
    body_order: list[str],
    loop_node_id: str,
    current_item: object,
    iteration_index: int,
    parent_ctx: ExecutionContext,
    executor_registry: dict,
) -> dict:
    """
    Runs one iteration of the loop body.
    """
    from engine.context import ExecutionContext

    sub_outputs = {
        loop_node_id: {"item": current_item, "value": current_item, "dataType": "any"}
    }

    sub_ctx = ExecutionContext(
        run_id=parent_ctx.run_id,
        workflow_id=parent_ctx.workflow_id,
        node_outputs=sub_outputs,
        global_state=parent_ctx.global_state,
        skipped_nodes=set(),
        completed_nodes=set(),
        sse_queue=parent_ctx.sse_queue,
        is_development=parent_ctx.is_development,
        graph=parent_ctx.graph,
        subgraph_members=parent_ctx.subgraph_members,
    )

    last_output = {"value": current_item, "dataType": "any"}

    for node_id in body_order:
        node_dict = _find_node(parent_ctx.graph, node_id)
        if node_dict is None:
            continue

        if node_id in sub_ctx.skipped_nodes:
            continue

        node_type = node_dict.get("type", "")
        execution_kind = node_dict.get("data", {}).get("execution", {}).get("kind", "")

        executor_cls = executor_registry.get(execution_kind)
        if not executor_cls:
            raise ValueError(f"No executor for kind {execution_kind!r} (node {node_id!r})")

        start = time.monotonic()
        await sub_ctx.emit(node_started(node_id))
        output = await executor_cls().execute(node_dict, sub_ctx)
        duration = time.monotonic() - start

        sub_ctx.node_outputs[node_id] = output
        sub_ctx.completed_nodes.add(node_id)
        await sub_ctx.emit(node_completed(node_id, duration))
        last_output = output

    return last_output


def _find_node(graph: dict, node_id: str) -> dict | None:
    for n in graph.get("nodes", []):
        if n.get("id") == node_id:
            return n
    return None


class LoopExecutor(ExecutorBase):
    """
    Iterates a collection and runs the body subgraph once per item.
    """

    executor_registry: dict = {}

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        collection = ctx.get_input(node_id, "collection")
        if collection is None:
            collection = []
        if not isinstance(collection, list):
            collection = [collection]

        max_iterations = int(data.get("maxIterations", _DEFAULT_MAX_ITERATIONS))
        collection = collection[:max_iterations]
        total = len(collection)

        body_node_ids = {
            nid for nid in ctx.subgraph_members
            if _is_body_of_this_loop(nid, node_id, ctx.graph)
        }

        if not body_node_ids:
            return {"results": collection, "done": True, "dataType": "array"}

        body_order = _topo_sort_body(body_node_ids, ctx.graph.get("edges", []))

        results = []
        for i, item in enumerate(collection):
            await ctx.emit(node_progress(node_id, i, total, item))

            iteration_output = await _execute_subgraph(
                body_order=body_order,
                loop_node_id=node_id,
                current_item=item,
                iteration_index=i,
                parent_ctx=ctx,
                executor_registry=self.__class__.executor_registry,
            )
            results.append(iteration_output.get("value", iteration_output))

        return {
            "results": results,
            "done": True,
            "value": results,
            "dataType": "array",
        }


def _is_body_of_this_loop(node_id: str, loop_node_id: str, graph: dict) -> bool:
    """
    Returns True if node_id belongs to this specific loop node's body.
    """
    item_handle_key = f"{loop_node_id}-item"
    edges = graph.get("edges", [])

    seeds = {
        e["target"] for e in edges
        if e.get("source") == loop_node_id
        and e.get("sourceHandle") == item_handle_key
        and e.get("target")
    }

    reachable = set()
    queue = list(seeds)
    while queue:
        current = queue.pop(0)
        if current in reachable:
            continue
        reachable.add(current)
        for e in edges:
            if e.get("source") == current and e.get("target") not in reachable:
                queue.append(e["target"])

    return node_id in reachable
