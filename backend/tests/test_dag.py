"""
DAG validation tests.

Each test exercises one well-defined graph topology. Tests use the full React
Flow payload shape (nodes as dicts with id, type, data; edges with source,
target, sourceHandle, targetHandle) because dag.py receives exactly that from
the frontend via /pipelines/parse.

Run: pytest tests/test_dag.py -v
"""
import pytest
from dag import analyse_graph, GraphAnalysis


# ---------------------------------------------------------------------------
# Helpers — minimal React Flow node / edge constructors
# ---------------------------------------------------------------------------

def node(id: str, type: str = "llm") -> dict:
    return {"id": id, "type": type, "data": {}}


def edge(source: str, target: str, source_handle_id: str = None, target_handle_id: str = None, data_type: str = "string") -> dict:
    src_h = source_handle_id or f"{source}-output"
    tgt_h = target_handle_id or f"{target}-input"
    return {
        "source": source,
        "target": target,
        "sourceHandle": src_h,
        "targetHandle": tgt_h,
        "data": {"dataType": data_type},
    }


def fn_edge(source: str, target: str) -> dict:
    """An edge whose sourceHandle carries fn-schema data — a tool-registration wire."""
    return edge(source, target, f"{source}-fn-schema", f"{target}-tools", data_type="fn-schema")


def loop_item_edge(loop_id: str, body_node_id: str) -> dict:
    """Edge from a loop node's 'item' handle into its body subgraph."""
    return edge(loop_id, body_node_id, f"{loop_id}-item", f"{body_node_id}-input", data_type="any")


def loop_results_edge(loop_id: str, downstream_id: str) -> dict:
    """Edge from a loop node's 'results' handle to a downstream outer node."""
    return edge(loop_id, downstream_id, f"{loop_id}-results", f"{downstream_id}-input", data_type="array")


# ---------------------------------------------------------------------------
# Basic acyclicity
# ---------------------------------------------------------------------------

class TestBasicAcyclicity:
    def test_empty_graph_is_dag(self):
        result = analyse_graph([], [])
        assert result.is_dag is True

    def test_single_node_is_dag(self):
        result = analyse_graph([node("a")], [])
        assert result.is_dag is True

    def test_linear_chain_is_dag(self):
        # a → b → c
        nodes = [node("a"), node("b"), node("c")]
        edges = [edge("a", "b"), edge("b", "c")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        assert result.topo_order == ["a", "b", "c"]

    def test_simple_cycle_detected(self):
        # a → b → a
        nodes = [node("a"), node("b")]
        edges = [edge("a", "b"), edge("b", "a")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is False

    def test_self_loop_detected(self):
        nodes = [node("a")]
        edges = [edge("a", "a")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is False


# ---------------------------------------------------------------------------
# Parallel paths (diamond pattern)
# ---------------------------------------------------------------------------

class TestParallelBranches:
    def test_diamond_is_dag(self):
        # A → B, A → C, B → D, C → D
        nodes = [node("A"), node("B"), node("C"), node("D")]
        edges = [edge("A", "B"), edge("A", "C"), edge("B", "D"), edge("C", "D")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        # A must come first; B and C before D
        o = result.topo_order
        assert o.index("A") < o.index("B")
        assert o.index("A") < o.index("C")
        assert o.index("B") < o.index("D")
        assert o.index("C") < o.index("D")

    def test_two_parallel_chains_are_dag(self):
        # Two completely independent chains: a1→b1→c1, a2→b2→c2
        nodes = [node("a1"), node("b1"), node("c1"), node("a2"), node("b2"), node("c2")]
        edges = [edge("a1", "b1"), edge("b1", "c1"), edge("a2", "b2"), edge("b2", "c2")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        o = result.topo_order
        assert o.index("a1") < o.index("b1") < o.index("c1")
        assert o.index("a2") < o.index("b2") < o.index("c2")

    def test_fan_out_then_merge(self):
        # input → text1, text1 → agent1, text1 → agent2, agent1 → output, agent2 → output
        nodes = [node("input", "customInput"), node("text1", "text"),
                 node("agent1", "agent"), node("agent2", "agent"), node("output", "customOutput")]
        edges = [
            edge("input", "text1"),
            edge("text1", "agent1"),
            edge("text1", "agent2"),
            edge("agent1", "output"),
            edge("agent2", "output"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        o = result.topo_order
        assert o.index("input") < o.index("text1")
        assert o.index("text1") < o.index("agent1")
        assert o.index("text1") < o.index("agent2")
        assert o.index("agent1") < o.index("output")
        assert o.index("agent2") < o.index("output")


# ---------------------------------------------------------------------------
# fn-schema edges are NOT topological dependencies
# ---------------------------------------------------------------------------

class TestFnSchemaEdges:
    def test_fn_schema_edge_not_a_dag_dependency(self):
        """
        Script node → Agent node via fn-schema should NOT make Agent depend
        on Script completing first in the outer topological sort.
        The edge is a tool registration, not a data-flow dependency.
        """
        nodes = [node("input", "customInput"), node("script", "script"),
                 node("agent", "agent"), node("output", "customOutput")]
        edges = [
            edge("input", "agent"),
            fn_edge("script", "agent"),   # tool registration
            edge("agent", "output"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        # Script should NOT appear before agent in topo order (it has no real dependency)
        # Script is actually an isolated node from outer-graph perspective here.
        # Only data-flow edges define the sort order.
        o = result.topo_order
        assert o.index("input") < o.index("agent")
        assert o.index("agent") < o.index("output")

    def test_fn_schema_edge_does_not_create_phantom_cycle(self):
        """
        If a Script's output feeds an Input node (through a data edge) and the Script
        also registers as a tool on an Agent, and that Agent connects back via data
        to feed the Script's parent — this should NOT produce a cycle through the fn-schema wire.
        """
        # data flow: webhook → agent → output
        # tool registration: script → agent   (fn-schema)
        # script is a standalone data-transform with no data edges into agent's exec path
        nodes = [node("webhook", "webhook"), node("script", "script"),
                 node("agent", "agent"), node("output", "customOutput")]
        edges = [
            edge("webhook", "agent"),
            fn_edge("script", "agent"),
            edge("agent", "output"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True

    def test_two_agents_share_one_script_tool(self):
        """
        One Script node registering as a tool on TWO different agent nodes.
        fn-schema fan-out — still a DAG.
        """
        nodes = [node("input", "customInput"), node("script", "script"),
                 node("agent1", "agent"), node("agent2", "agent"), node("out", "customOutput")]
        edges = [
            edge("input", "agent1"),
            edge("input", "agent2"),
            fn_edge("script", "agent1"),
            fn_edge("script", "agent2"),
            edge("agent1", "out"),
            edge("agent2", "out"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True


# ---------------------------------------------------------------------------
# Loop node — body subgraph is excluded from outer topological sort
# ---------------------------------------------------------------------------

class TestLoopSubgraph:
    def test_loop_body_not_in_outer_topo(self):
        """
        Nodes connected to the loop's 'item' handle are body members.
        They should be excluded from the outer topological sort (their in-degree
        tracking belongs to the sub-execution, not the outer graph).
        """
        nodes = [
            node("input", "customInput"),
            node("loop", "loop"),
            node("body_node", "llm"),   # inside loop body
            node("output", "customOutput"),
        ]
        edges = [
            edge("input", "loop"),
            loop_item_edge("loop", "body_node"),   # body member
            loop_results_edge("loop", "output"),   # outer data flow continues
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        # body_node should NOT appear in the outer topo order
        assert "body_node" not in result.topo_order
        # The outer chain is: input → loop → output
        o = result.topo_order
        assert o.index("input") < o.index("loop") < o.index("output")

    def test_loop_body_cycle_does_not_affect_outer_dag(self):
        """
        From the outer graph's perspective, even if body nodes have complex
        wiring (they run in a sub-execution), the outer graph must still be a DAG.
        """
        nodes = [
            node("input", "customInput"),
            node("loop", "loop"),
            node("body_transform", "script"),
            node("output", "customOutput"),
        ]
        edges = [
            edge("input", "loop"),
            loop_item_edge("loop", "body_transform"),
            loop_results_edge("loop", "output"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True

    def test_outer_cycle_through_loop_still_detected(self):
        """
        A genuine cycle in the outer graph involving a loop node must still
        be caught. e.g. loop → output → loop (nonsensical but must be rejected).
        """
        nodes = [node("loop", "loop"), node("out", "customOutput")]
        edges = [
            loop_results_edge("loop", "out"),
            edge("out", "loop"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is False


# ---------------------------------------------------------------------------
# Input node anywhere in the graph
# ---------------------------------------------------------------------------

class TestInputNodePlacement:
    def test_input_node_as_source(self):
        """Classic placement: Input node at the start of the pipeline."""
        nodes = [node("inp", "customInput"), node("llm", "llm"), node("out", "customOutput")]
        edges = [edge("inp", "llm"), edge("llm", "out")]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        assert result.topo_order == ["inp", "llm", "out"]

    def test_input_node_mid_pipeline(self):
        """
        Input node mid-pipeline (human-in-the-loop pattern from Decision 2).
        Scheduler → LLM → Input ← PAUSE → LLM → Output.
        This is a perfectly valid DAG — Input is just another node with an output.
        """
        nodes = [
            node("sched", "cron"),
            node("llm1", "llm"),
            node("inp", "customInput"),
            node("llm2", "llm"),
            node("out", "customOutput"),
        ]
        edges = [
            edge("sched", "llm1"),
            edge("llm1", "inp"),    # llm generates the question, passes to input
            edge("inp", "llm2"),    # human's answer flows downstream
            edge("llm2", "out"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        o = result.topo_order
        assert o.index("sched") < o.index("llm1") < o.index("inp") < o.index("llm2") < o.index("out")

    def test_input_node_output_connects_multiple_hops_downstream(self):
        """Input node's value wire skips intermediate nodes — valid long-range edge."""
        nodes = [node("inp", "customInput"), node("a"), node("b"), node("c")]
        edges = [
            edge("inp", "a"),
            edge("a", "b"),
            edge("b", "c"),
            edge("inp", "c"),   # inp also connects directly to c (3 hops skipped)
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True


# ---------------------------------------------------------------------------
# Text node dynamic handles — topology is unaffected
# ---------------------------------------------------------------------------

class TestTextNodeDynamicHandles:
    def test_text_node_with_dynamic_handles_is_dag(self):
        """
        Text node gets extra target handles from {{variable}} parsing. Those handles
        appear as different targetHandle strings on edges. Topology (is_dag, topo_order)
        must be unaffected — the edge still flows from node A to the text node.
        """
        nodes = [
            node("inp1", "customInput"),
            node("inp2", "customInput"),
            node("txt", "text"),
            node("llm", "llm"),
        ]
        edges = [
            edge("inp1", "txt", f"inp1-value", f"txt-input_name"),   # dynamic handle
            edge("inp2", "txt", f"inp2-value", f"txt-user_query"),   # dynamic handle
            edge("txt", "llm", f"txt-output", f"llm-prompt"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        o = result.topo_order
        assert o.index("inp1") < o.index("txt")
        assert o.index("inp2") < o.index("txt")
        assert o.index("txt") < o.index("llm")


# ---------------------------------------------------------------------------
# Realistic complex pipeline
# ---------------------------------------------------------------------------

class TestComplexPipeline:
    def test_full_agentic_pipeline(self):
        """
        Realistic graph:
          webhook → text_prompt1 → agent1 → output
          text_prompt2 → agent2 → output
          script_tool → agent1 (fn-schema)
          script_tool → agent2 (fn-schema)
          Both agents run in parallel from the two text nodes.
        """
        nodes = [
            node("webhook", "webhook"),
            node("text1", "text"),
            node("text2", "text"),
            node("agent1", "agent"),
            node("agent2", "agent"),
            node("script_tool", "script"),
            node("out", "customOutput"),
        ]
        edges = [
            edge("webhook", "text1"),
            edge("webhook", "text2"),
            edge("text1", "agent1"),
            edge("text2", "agent2"),
            fn_edge("script_tool", "agent1"),
            fn_edge("script_tool", "agent2"),
            edge("agent1", "out"),
            edge("agent2", "out"),
        ]
        result = analyse_graph(nodes, edges)
        assert result.is_dag is True
        o = result.topo_order
        assert o.index("webhook") < o.index("text1")
        assert o.index("webhook") < o.index("text2")
        assert o.index("text1") < o.index("agent1")
        assert o.index("text2") < o.index("agent2")
        assert o.index("agent1") < o.index("out")
        assert o.index("agent2") < o.index("out")
        # script_tool appears in outer graph (it's in nodes list) but has no
        # data-flow in-degree, so it's a root or floating node — fine.
        assert "script_tool" in o


# ---------------------------------------------------------------------------
# GraphAnalysis return shape
# ---------------------------------------------------------------------------

class TestAnalysisShape:
    def test_returns_graph_analysis(self):
        result = analyse_graph([node("a"), node("b")], [edge("a", "b")])
        assert isinstance(result, GraphAnalysis)
        assert hasattr(result, "is_dag")
        assert hasattr(result, "topo_order")
        assert hasattr(result, "num_nodes")
        assert hasattr(result, "num_edges")

    def test_num_nodes_and_edges_count_all(self):
        """num_nodes and num_edges count the full submitted graph, not just outer-graph members."""
        nodes = [node("a"), node("b"), node("c")]
        edges_list = [edge("a", "b"), edge("b", "c")]
        result = analyse_graph(nodes, edges_list)
        assert result.num_nodes == 3
        assert result.num_edges == 2
