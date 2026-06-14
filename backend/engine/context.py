"""
ExecutionContext — the shared object threaded through the entire execution chain.

Every executor receives this context instead of the raw graph or run dict.
This is the single source of truth for:
  - Node outputs accumulated so far
  - Which nodes to skip (branch-dead paths)
  - The SSE event queue
  - The raw graph (needed for edge resolution)

Design principle: executors are dumb. They call ctx.get_input() and ctx.emit().
They never inspect the graph themselves. The context hides graph topology.
"""
from __future__ import annotations
import asyncio
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ExecutionContext:
    """
    Shared execution state for a single pipeline run.

    Passed by reference through every executor — mutating node_outputs,
    skipped_nodes, and completed_nodes is intentional and expected.
    The SSE queue is written by executors (via emit()) and drained by the
    SSE endpoint.
    """
    run_id: str
    workflow_id: str

    # Accumulated node outputs: {node_id: {handle_id: value, "dataType": str}}
    node_outputs: dict = field(default_factory=dict)

    # Persistent conversation + variable state across runs
    global_state: dict = field(default_factory=lambda: {"messages": [], "variables": {}})

    # Node IDs that must not execute (inactive branch targets)
    skipped_nodes: set = field(default_factory=set)

    # Node IDs that have successfully completed
    completed_nodes: set = field(default_factory=set)

    # The SSE channel: executors write events here, the endpoint drains it
    sse_queue: asyncio.Queue = field(default_factory=asyncio.Queue)

    # Controls inline input mode
    is_development: bool = True

    # Full graph for edge resolution — {nodes: [...], edges: [...]}
    graph: dict = field(default_factory=lambda: {"nodes": [], "edges": []})

    # Subgraph member IDs — body nodes run inside Loop executor, not outer sort
    subgraph_members: set = field(default_factory=set)

    def get_input(self, node_id: str, handle_id: str) -> Any:
        """
        Follows the edge that targets handle `handle_id` on node `node_id`
        and returns the upstream node's output for the corresponding source handle.

        React Flow handle convention: edges store targetHandle as "{nodeId}-{handleId}".
        We reconstruct this key to find the right edge.
        """
        target_handle_key = f"{node_id}-{handle_id}"
        edges = self.graph.get("edges", [])

        for edge in edges:
            if edge.get("target") == node_id and edge.get("targetHandle") == target_handle_key:
                source_node_id = edge.get("source")
                source_handle_key = edge.get("sourceHandle", "")
                source_handle_id = _strip_node_prefix(source_handle_key, source_node_id)

                upstream = self.node_outputs.get(source_node_id, {})
                return upstream.get(source_handle_id)

        return None

    def get_node_data(self, node_id: str) -> dict:
        """
        Returns the node's data dict.
        """
        for node in self.graph.get("nodes", []):
            if node.get("id") == node_id:
                return node.get("data", {})
        return {}

    async def emit(self, event: dict) -> None:
        """
        Puts an SSE event onto the queue.
        """
        await self.sse_queue.put(event)


def _strip_node_prefix(source_handle_key: str, source_node_id: str) -> str:
    """
    React Flow stores sourceHandle as "{nodeId}-{handleId}".
    We need just the handleId part to look up the executor's output.
    """
    prefix = f"{source_node_id}-"
    if source_handle_key.startswith(prefix):
        return source_handle_key[len(prefix):]
    return source_handle_key
