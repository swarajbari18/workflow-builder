"""
DAG analysis — topology validation and execution ordering.

Understands the pipeline graph semantics, not just raw graph theory:

  - fn-schema edges (dataType == 'fn-schema') are tool-registration wires. They
    tell an Agent *which* tools it can call internally at runtime. They do NOT
    create a data-flow dependency in the outer execution order — the Agent does
    not wait for the Script to "run" before it starts; the Script is not an
    upstream producer in the pipeline sense.

  - Loop subgraph nodes: any node reached from a loop node via its 'item' handle
    is a body member. The execution engine runs body members inside the loop
    executor per iteration. From the outer graph's perspective they are invisible
    — they are not nodes in the topological sort.

  - Every other edge (including Input nodes anywhere in the graph, Text dynamic
    variable handles, Condition branch outputs, parallel paths) is a normal
    directed data-flow edge. Kahn's algorithm handles all of them correctly.

  - Cycle detection: when the graph is NOT a DAG, the nodes that could not be
    processed by Kahn's algorithm are the cycle members (or depend on the cycle).
    A DFS over those nodes identifies the specific back edges — the edges whose
    source node is returned as cycle_back_edge_sources. Removing any of those
    edges would break the cycle.

This module is backend-only. The same GraphAnalysis result is returned from
/pipelines/parse AND used by the execution engine (Phase 6) to obtain the
ordered execution list.
"""
from __future__ import annotations
from dataclasses import dataclass, field


FN_SCHEMA_DATA_TYPE = "fn-schema"
LOOP_NODE_TYPE = "loop"
LOOP_ITEM_HANDLE_SUFFIX = "-item"


@dataclass
class GraphAnalysis:
    is_dag: bool
    topo_order: list[str]           # outer nodes in execution order
    subgraph_members: list[str]     # loop body nodes (run inside loop executor)
    tool_nodes: list[str]           # fn-schema sources (called internally by agent)
    cycle_nodes: list[str]          # nodes in/dependent on a cycle (is_dag=False only)
    cycle_back_edge_sources: list[str]  # nodes whose outgoing edge closes the cycle
    num_nodes: int
    num_edges: int


def _is_fn_schema_edge(edge: dict) -> bool:
    """
    Returns True for edges that carry a function schema (tool-registration wires).
    These connect a Script/Transform node's fn-schema handle to an Agent's tools handle.
    They define which tools an Agent may call at runtime — not an execution-order
    dependency. Excluded from the outer-graph adjacency entirely.
    """
    data = edge.get("data") or {}
    return data.get("dataType") == FN_SCHEMA_DATA_TYPE


def _is_loop_item_edge(edge: dict) -> bool:
    """
    Returns True for edges that connect a loop node's 'item' handle to a body node.
    The body nodes execute inside the loop executor, not in the outer topological sort.
    """
    source_handle: str = edge.get("sourceHandle", "")
    source_node_type_check: str = edge.get("source", "")
    return source_handle.endswith(LOOP_ITEM_HANDLE_SUFFIX) and _source_is_loop_node(edge)


def _source_is_loop_node(edge: dict) -> bool:
    """
    We cannot know node types from the edge alone — the full nodes list is needed.
    This is a handle-naming convention check: loop nodes name their subgraph entry
    handle 'item', so the sourceHandle ends with '-item'.
    The caller already passes this check from _collect_subgraph_members which has
    the full nodes list. For the simpler _is_loop_item_edge used during edge iteration,
    we rely on the convention that only loop nodes emit an '-item' source handle.
    """
    return True  # confirmed by handle naming convention + node type in _collect_subgraph_members


def _collect_subgraph_members(nodes: list[dict], edges: list[dict]) -> set[str]:
    """
    Returns the set of node IDs that belong to loop body subgraphs.
    These nodes are executed by the loop executor internally and must not appear
    in the outer topological sort.

    Algorithm: BFS from each loop node's body-entry edge. Any node reachable
    from the loop's 'item' handle edge (following non-fn-schema edges) is a body member.
    """
    loop_node_ids = {n["id"] for n in nodes if n.get("type") == LOOP_NODE_TYPE}

    # Build a quick adjacency for reachability — only non-fn-schema edges.
    reachable_from: dict[str, list[str]] = {n["id"]: [] for n in nodes}
    for e in edges:
        if _is_fn_schema_edge(e):
            continue
        src, tgt = e.get("source"), e.get("target")
        if src and tgt and src in reachable_from:
            reachable_from[src].append(tgt)

    subgraph_members: set[str] = set()

    for loop_id in loop_node_ids:
        # Seed: direct targets of the loop's 'item' handle
        seeds = [
            e.get("target")
            for e in edges
            if e.get("source") == loop_id
            and (e.get("sourceHandle") or "").endswith(LOOP_ITEM_HANDLE_SUFFIX)
            and not _is_fn_schema_edge(e)
            and e.get("target")
        ]

        # BFS to collect all nodes reachable from the loop body entry
        queue = list(seeds)
        while queue:
            current = queue.pop()
            if current in subgraph_members or current in loop_node_ids:
                continue
            subgraph_members.add(current)
            queue.extend(reachable_from.get(current, []))

    return subgraph_members


def _find_back_edge_sources(cycle_node_ids: set[str], adjacency: dict[str, list[str]]) -> list[str]:
    """
    DFS over the cycle subgraph to find back-edge source nodes.

    A back edge is one from a node currently on the DFS stack to an ancestor
    also on the stack — it is the edge that closes the loop. Its source node
    is the one the user should disconnect to break the cycle.

    Returns a list (possibly more than one for complex cycles) of node IDs
    that are the sources of back edges within the cycle subgraph.
    """
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {n: WHITE for n in cycle_node_ids}
    back_edge_sources: list[str] = []

    def dfs(u: str) -> None:
        color[u] = GRAY
        for v in adjacency.get(u, []):
            if v not in cycle_node_ids:
                continue
            if color[v] == GRAY and u not in back_edge_sources:
                back_edge_sources.append(u)
            elif color[v] == WHITE:
                dfs(v)
        color[u] = BLACK

    for node in cycle_node_ids:
        if color[node] == WHITE:
            dfs(node)

    return back_edge_sources


def analyse_graph(nodes: list[dict], edges: list[dict]) -> GraphAnalysis:
    """
    Validates the pipeline graph and returns an execution-ordered node list.

    Returns a GraphAnalysis with:
      is_dag       — True when the outer graph (excluding subgraph members) is acyclic
      topo_order   — outer nodes in a valid execution order (Kahn's algorithm)
      num_nodes    — total nodes submitted (including subgraph members and isolated nodes)
      num_edges    — total edges submitted (all edges, before any filtering)
    """
    subgraph_members = _collect_subgraph_members(nodes, edges)

    # Outer nodes: everything not in a loop body
    outer_node_ids = {n["id"] for n in nodes if n["id"] not in subgraph_members}

    # Build adjacency and in-degree from data-flow edges only.
    # Excluded: fn-schema edges and edges touching subgraph members.
    in_degree: dict[str, int] = {nid: 0 for nid in outer_node_ids}
    adjacency: dict[str, list[str]] = {nid: [] for nid in outer_node_ids}

    for e in edges:
        if _is_fn_schema_edge(e):
            continue
        src, tgt = e.get("source"), e.get("target")
        if src not in outer_node_ids or tgt not in outer_node_ids:
            continue
        adjacency[src].append(tgt)
        in_degree[tgt] += 1

    # Kahn's algorithm
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    topo_order: list[str] = []

    while queue:
        current = queue.pop(0)  # FIFO for stable ordering
        topo_order.append(current)
        for neighbour in adjacency[current]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    is_dag = len(topo_order) == len(outer_node_ids)

    # Nodes Kahn's could not process are in (or blocked by) a cycle.
    cycle_nodes: list[str] = []
    cycle_back_edge_sources: list[str] = []
    if not is_dag:
        processed = set(topo_order)
        cycle_nodes = [nid for nid in outer_node_ids if nid not in processed]
        cycle_back_edge_sources = _find_back_edge_sources(set(cycle_nodes), adjacency)

    tool_nodes = [e["source"] for e in edges if _is_fn_schema_edge(e)]

    return GraphAnalysis(
        is_dag=is_dag,
        topo_order=topo_order if is_dag else [],
        subgraph_members=list(subgraph_members),
        tool_nodes=tool_nodes,
        cycle_nodes=cycle_nodes,
        cycle_back_edge_sources=cycle_back_edge_sources,
        num_nodes=len(nodes),
        num_edges=len(edges),
    )


if __name__ == "__main__":
    # Smoke block: linear chain, then a cycle.
    linear = analyse_graph(
        [{"id": "a"}, {"id": "b"}, {"id": "c"}],
        [{"source": "a", "target": "b", "data": {}}, {"source": "b", "target": "c", "data": {}}],
    )
    print(f"Linear chain is_dag={linear.is_dag} order={linear.topo_order}")

    cyclic = analyse_graph(
        [{"id": "a"}, {"id": "b"}],
        [{"source": "a", "target": "b", "data": {}}, {"source": "b", "target": "a", "data": {}}],
    )
    print(f"Cycle is_dag={cyclic.is_dag}")
