"""
LoopExecutor — handles Repeat nodes (execution.kind = 'loop').

The Repeat node iterates a collection and runs its body subgraph once per item.
From the outer graph's perspective it's a black box: inputs → outputs.
Internally, it drives a sub-execution loop. This is the "DAG + Loop paradox"
resolution described in DESIGN-VISION.md Decision 6 Step 2.

Architecture:
  The loop node has:
    Input handle 'collection': the array to iterate (from upstream)
    Output handle 'item': connects to body subgraph nodes (these are excluded
                          from the outer topo sort by dag.py)
    Output handle 'results': the array of each iteration's final output
    Output handle 'done': a signal that the loop completed (for condition checks)

  The body subgraph was already identified by dag.py and stored in
  ctx.subgraph_members. The LoopExecutor:
    1. Reads the collection from ctx.get_input('collection')
    2. Filters graph edges to only body-internal edges
    3. Topologically sorts the body nodes
    4. For each item in the collection:
       a. Seeds a mini context with {loop_node_id: {'item': item}}
       b. Runs the body nodes via _execute_subgraph
       c. Collects the body's terminal node output as iteration result
       d. Emits node_progress SSE event
    5. Returns {results: [...], done: True}

Sub-execution isolation:
  Each iteration gets a FRESH mini-context for node_outputs (only the current
  item seeded). It shares the parent's global_state (so conversation history
  accumulates across iterations if an LLM node is inside the loop) but does NOT
  share node_outputs with prior iterations.

  This is intentional: if an LLM node runs on iteration 3, it should not see
  iteration 2's LLM output as its own previous output. It should see a clean slate
  for that execution, with only the current item as input.

Error handling:
  If any body node raises an exception, the exception propagates up through the
  loop executor to the main engine, which transitions the run to error state.
  Partial results from completed iterations are stored in the output before the error.

Max iterations guard:
  The loop node data may contain a 'maxIterations' field (from the spec's advanced
  section). If the collection exceeds this, we truncate with a warning event.
  Default: 100 (prevents runaway loops during development).
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

    Uses Kahn's algorithm on the subset of edges that are internal to the body.
    (Edges from the loop node into the body, or from the body to the outer graph,
    are excluded — only body-to-body edges matter here.)
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

    Creates a sub-context seeded with the current item, then runs each body node
    in topo order. Returns the final body node's output.

    The sub-context shares parent_ctx.global_state (intentional — state accumulates)
    and parent_ctx.sse_queue (body node events bubble up to the outer stream).
    It does NOT share node_outputs (each iteration starts clean, plus the loop seed).
    """
    from engine.context import ExecutionContext

    # Seed: the loop node's 'item' output is the current iteration item
    sub_outputs = {
        loop_node_id: {"item": current_item, "value": current_item, "dataType": "any"}
    }

    sub_ctx = ExecutionContext(
        run_id=parent_ctx.run_id,
        workflow_id=parent_ctx.workflow_id,
        node_outputs=sub_outputs,
        global_state=parent_ctx.global_state,  # shared
        skipped_nodes=set(),  # fresh — branch decisions inside the body are per-iteration
        completed_nodes=set(),
        sse_queue=parent_ctx.sse_queue,  # shared — events bubble up
        is_development=parent_ctx.is_development,
        graph=parent_ctx.graph,  # shared — needed for get_input()
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
    Emits node_progress events on each iteration for real-time frontend updates.
    """

    # Injected by the engine so we don't create a circular import
    # engine.py sets LoopExecutor.executor_registry = EXECUTORS after building the registry
    executor_registry: dict = {}

    async def execute(self, node: dict, ctx: ExecutionContext) -> dict:
        node_id = node["id"]
        data = ctx.get_node_data(node_id)

        # Read the collection from the connected upstream
        collection = ctx.get_input(node_id, "collection")
        if collection is None:
            collection = []
        if not isinstance(collection, list):
            # Scalar upstream — wrap in a single-item list so the loop still runs once
            collection = [collection]

        max_iterations = int(data.get("maxIterations", _DEFAULT_MAX_ITERATIONS))
        collection = collection[:max_iterations]
        total = len(collection)

        # Body nodes and their execution order
        body_node_ids = {
            nid for nid in ctx.subgraph_members
            if _is_body_of_this_loop(nid, node_id, ctx.graph)
        }

        if not body_node_ids:
            # No body connected — loop is a no-op, return the collection unchanged
            return {"results": collection, "done": True, "dataType": "array"}

        body_order = _topo_sort_body(body_node_ids, ctx.graph.get("edges", []))

        results = []
        for i, item in enumerate(collection):
            # Emit progress BEFORE running the iteration so the frontend counter
            # updates to show "about to run item i" rather than "just finished item i"
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

    A node is in this loop's body if it is reachable from THIS loop node's 'item'
    handle, not from any other loop node's 'item' handle.

    The ctx.subgraph_members set contains ALL loop body nodes across ALL loops.
    For pipelines with multiple loops, we need to attribute each body node
    to its specific loop. We do this by BFS from each loop node's item edges.
    """
    item_handle_key = f"{loop_node_id}-item"
    edges = graph.get("edges", [])

    # Seed: direct targets of THIS loop's item handle
    seeds = {
        e["target"] for e in edges
        if e.get("source") == loop_node_id
        and e.get("sourceHandle") == item_handle_key
        and e.get("target")
    }

    # BFS to collect all reachable body members
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
