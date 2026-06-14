"""
Pipeline API — FastAPI backend for the pipeline builder.

Endpoints:
  GET  /             — health check
  POST /pipelines/parse — validates graph structure, returns is_dag

The parse endpoint accepts the serialised graph (nodes + edges) and runs
Kahn's topological sort to detect cycles. It does NOT execute the pipeline —
that is the execution engine's job (Phase 6+).
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class Pipeline(BaseModel):
    nodes: list
    edges: list


def _is_dag(nodes: list, edges: list) -> bool:
    """
    Returns True when the graph contains no directed cycle (Kahn's algorithm).
    An empty graph is trivially acyclic.
    """
    node_ids = {n["id"] for n in nodes}
    in_degree = {nid: 0 for nid in node_ids}
    adjacency = {nid: [] for nid in node_ids}

    for edge in edges:
        src, tgt = edge.get("source"), edge.get("target")
        if src in adjacency and tgt in in_degree:
            adjacency[src].append(tgt)
            in_degree[tgt] += 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    visited = 0

    while queue:
        current = queue.pop()
        visited += 1
        for neighbour in adjacency[current]:
            in_degree[neighbour] -= 1
            if in_degree[neighbour] == 0:
                queue.append(neighbour)

    return visited == len(nodes)


@app.get("/")
def read_root():
    return {"ping": "pong"}


@app.post("/pipelines/parse")
def parse_pipeline(pipeline: Pipeline):
    return {
        "num_nodes": len(pipeline.nodes),
        "num_edges": len(pipeline.edges),
        "is_dag": _is_dag(pipeline.nodes, pipeline.edges),
    }
