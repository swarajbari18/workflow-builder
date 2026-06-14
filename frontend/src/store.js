/**
 * Pipeline store — central state for nodes, edges, and canvas interaction.
 *
 * Core systems:
 *   - Connection mode: tracks what the user is dragging and from where.
 *   - Command palette: open/close with optional data-type filter for wire drops.
 *   - Context menu: one menu at a time, typed by the surface it was opened on.
 *   - DAG status: 'pristine' | 'pending' | 'valid' | 'invalid'.
 *   - nodeRoles: per-node categorisation from the last parse result.
 *
 * Phase 8 additions:
 *   - nodeOutputCache: per-node run output, inputs, timing, errors — persists
 *     across the session for inspection and partial re-execution.
 *   - globalState: conversation history + variables from the last completed run.
 *   - staleNodeIds: nodes whose config changed since the last run.
 *   - statePanelOpen: whether the Global State slide-in panel is visible.
 *   - inspectedNodeId: which node's inspection card is open (null = closed).
 *   - testPanelNodeId: which node's test panel is open (null = closed).
 *   - suspendedRun: context for the inline Input node suspension UI.
 */
import { create } from "zustand";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
  } from 'reactflow';
import { NODE_SPECS } from './nodes/nodeSpecs';
import { handleSseEvent } from './canvas/sse-event-handler';
import { getStaleNodeIds } from './canvas/stale-propagation';

const BACKEND_URL = 'http://localhost:8000';

// Module-level so it never triggers re-renders and clearTimeout works across calls.
let _highlightTimer = null;

/**
 * Opens an EventSource to the run's SSE stream and applies state patches
 * from handleSseEvent on every message. Handles the pipeline lifecycle
 * (completed, error) with auto-reset and cleans up the source on close.
 */
function _subscribeToRunStream(streamUrl, run_id, get, set) {
  const evtSource = new EventSource(streamUrl);

  evtSource.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }

    const state = get();
    const patch = handleSseEvent(event, state);
    if (patch) set(patch);

    // Webhook node: inject emitted output as receivedPayload for the field picker.
    if (event.type === 'node_output') {
      const node = get().nodes.find((n) => n.id === event.nodeId);
      if (node?.type === 'webhook' && event.output && typeof event.output === 'object') {
        const preview = event.output.payload ?? event.output;
        set({
          nodes: get().nodes.map((n) =>
            n.id === event.nodeId
              ? { ...n, data: { ...n.data, receivedPayload: JSON.stringify(preview) } }
              : n,
          ),
        });
      }
    }

    if (event.type === 'execution_suspended') {
      evtSource.close();
    }

    if (event.type === 'pipeline_completed') {
      evtSource.close();
      setTimeout(() => {
        set({
          runStatus: 'idle',
          activeRunId: null,
          nodes: get().nodes.map((n) => ({
            ...n,
            data: { ...n.data, executionState: 'idle' },
          })),
        });
      }, 4000);
    }

    if (event.type === 'execution_error') {
      evtSource.close();
      setTimeout(() => {
        set({ runStatus: 'idle', activeRunId: null });
      }, 4000);
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
    set({ runStatus: 'error', activeRunId: null });
  };
}

function _clearHighlight(set) {
  if (_highlightTimer) { clearTimeout(_highlightTimer); _highlightTimer = null; }
  set({ nodeRoles: {}, dagStatus: 'pristine' });
}

function _scheduleHighlightClear(set) {
  if (_highlightTimer) clearTimeout(_highlightTimer);
  _highlightTimer = setTimeout(() => {
    _highlightTimer = null;
    set({ nodeRoles: {}, dagStatus: 'pristine' });
  }, 5000);
}

export const useStore = create((set, get) => ({
    nodes: [],
    edges: [],

    // React Flow instance — set via onInit in ui.js so dock/palette can call
    // screenToFlowPosition when placing nodes without a drag event.
    rfInstance: null,
    setRFInstance: (instance) => set({ rfInstance: instance }),

    getNodeID: (type) => {
        const newIDs = {...get().nodeIDs};
        if (newIDs[type] === undefined) {
            newIDs[type] = 0;
        }
        newIDs[type] += 1;
        set({nodeIDs: newIDs});
        return `${type}-${newIDs[type]}`;
    },
    addNode: (node) => {
        set({
            nodes: [...get().nodes, node]
        });
    },
    onNodesChange: (changes) => {
      // Only structural changes (add/remove) invalidate the DAG result.
      // Position, dimension, and select changes are non-topological.
      const isStructural = changes.some((c) => c.type === 'add' || c.type === 'remove');
      if (isStructural && get().dagStatus !== 'pristine') _clearHighlight(set);
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },
    onEdgesChange: (changes) => {
      // Only structural changes (add/remove) invalidate the DAG result.
      // Select changes are non-topological.
      const isStructural = changes.some((c) => c.type === 'add' || c.type === 'remove');
      if (isStructural && get().dagStatus !== 'pristine') _clearHighlight(set);
      set({
        edges: applyEdgeChanges(changes, get().edges),
      });
    },
    onConnect: (connection) => {
      const sourceNode = get().nodes.find((n) => n.id === connection.source);
      const sourceSpec = sourceNode && NODE_SPECS[sourceNode.type];
      const sourceHandle = sourceSpec?.handles.find(
        (h) => `${connection.source}-${h.id}` === connection.sourceHandle,
      );
      const dataType = sourceHandle?.dataType ?? 'any';

      // Adding an edge may create a cycle — reset before the user re-submits.
      if (get().dagStatus !== 'pristine') _clearHighlight(set);

      set({
        edges: addEdge({ ...connection, type: 'typed', data: { dataType } }, get().edges),
      });
    },
    // Returns a new node object (rather than mutating in place) so React Flow
    // reliably detects the data change and re-renders the affected node.
    updateNodeField: (nodeId, fieldName, fieldValue) => {
      const { nodes, edges, staleNodeIds } = get();

      // Config changes make this node and all downstream nodes stale.
      // Internal state fields (executionState, displayState) don't trigger staleness.
      const internalFields = new Set(['executionState', 'receivedPayload', 'payloadFields', 'testMode', 'samplePayload']);
      const nextStale = internalFields.has(fieldName)
        ? staleNodeIds
        : new Set([...staleNodeIds, ...getStaleNodeIds(nodeId, nodes, edges)]);

      // Apply stale executionState to all newly stale nodes.
      const updatedNodes = nodes.map((node) => {
        if (node.id === nodeId) {
          return { ...node, data: { ...node.data, [fieldName]: fieldValue, executionState: nextStale.has(nodeId) ? 'stale' : node.data.executionState } };
        }
        if (nextStale.has(node.id) && node.data.executionState !== 'stale') {
          return { ...node, data: { ...node.data, executionState: 'stale' } };
        }
        return node;
      });

      set({ nodes: updatedNodes, staleNodeIds: nextStale });
      // Deliberately does NOT reset dagStatus — field values do not affect
      // graph topology, so the DAG result is still valid for the current structure.
    },

    // Bulk update of multiple data fields at once.
    // Used by the SSE consumer to inject receivedPayload into a webhook node after
    // a test run, without triggering multiple re-renders.
    updateNodeData: (nodeId, dataUpdates) => {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...dataUpdates } }
            : node,
        ),
      });
    },

    // ------------------------------------------------------------------
    // Pipeline execution — the live run system
    // ------------------------------------------------------------------

    // null = no run active; string = run_id of the active run
    activeRunId: null,
    // 'idle' | 'running' | 'completed' | 'error'
    runStatus: 'idle',

    // Per-node run data: output, dataType, timing, error, streaming text, loop progress.
    // Persists for the session so inspection cards and partial re-runs work.
    nodeOutputCache: {},

    // Conversation history + variables from the last completed run.
    globalState: { messages: [], variables: {} },

    // Node IDs whose config has changed since the last run (stale tracking).
    staleNodeIds: new Set(),

    // Global State Panel — right-side slide-in.
    statePanelOpen: false,
    openStatePanel: () => set({ statePanelOpen: true }),
    closeStatePanel: () => set({ statePanelOpen: false }),
    toggleStatePanel: () => set((s) => ({ statePanelOpen: !s.statePanelOpen })),

    // Node Inspection Card — shows past-run data for one node.
    inspectedNodeId: null,
    openInspectionCard: (nodeId) => set({ inspectedNodeId: nodeId }),
    closeInspectionCard: () => set({ inspectedNodeId: null }),

    // Node Testing Panel — inject mock inputs and run in isolation.
    testPanelNodeId: null,
    openTestPanel: (nodeId) => set({ testPanelNodeId: nodeId }),
    closeTestPanel: () => set({ testPanelNodeId: null }),

    // Suspended run context — for the inline Input node suspension UI.
    // { runId, nodeId, prompt } — null when no run is suspended.
    suspendedRun: null,

    /**
     * Opens an SSE stream and drives all node visual states from the events.
     * Uses handleSseEvent (pure) for all state transitions; handles side effects
     * (setTimeout, evtSource.close) here.
     *
     * @param {Object} options
     * @param {Object} [options.reuse_outputs] - Cached outputs for partial re-run.
     */
    runPipeline: async ({ reuse_outputs } = {}) => {
      const { nodes, edges } = get();

      // Derive the trigger payload from a webhook node in test mode.
      let triggerPayload = {};
      const webhookNode = nodes.find((n) => n.type === 'webhook' && n.data.testMode === true);
      if (webhookNode?.data?.samplePayload) {
        try { triggerPayload = JSON.parse(webhookNode.data.samplePayload); } catch { /* use {} */ }
      }

      // Reset all nodes to idle, clear caches, clear stale set
      set({
        nodes: nodes.map((n) => ({
          ...n,
          data: { ...n.data, executionState: 'idle' },
        })),
        runStatus: 'running',
        activeRunId: null,
        nodeOutputCache: {},
        staleNodeIds: new Set(),
        suspendedRun: null,
      });

      try {
        const body = {
          nodes,
          edges,
          trigger_payload: triggerPayload,
          is_development: true,
        };
        if (reuse_outputs) body.reuse_outputs = reuse_outputs;

        const r = await fetch(`${BACKEND_URL}/pipelines/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!r.ok) {
          set({ runStatus: 'error' });
          return;
        }

        const { run_id, stream_url } = await r.json();
        set({ activeRunId: run_id });

        _subscribeToRunStream(`${BACKEND_URL}${stream_url}`, run_id, get, set);

      } catch {
        set({ runStatus: 'error', activeRunId: null });
      }
    },

    /**
     * Runs only the stale nodes and their downstream, reusing cached outputs
     * for fresh upstream nodes.
     *
     * @param {string} fromNodeId - The node the user right-clicked "Run from here" on.
     */
    runFromNode: async (fromNodeId) => {
      const { nodes, edges, nodeOutputCache, staleNodeIds } = get();
      const stale = staleNodeIds.size > 0 ? staleNodeIds : getStaleNodeIds(fromNodeId, nodes, edges);

      // Build reuse_outputs from cached outputs of nodes that are NOT stale.
      const reuseOutputs = {};
      for (const [nodeId, cached] of Object.entries(nodeOutputCache)) {
        if (!stale.has(nodeId) && cached.output !== undefined) {
          reuseOutputs[nodeId] = { value: cached.output, output: cached.output, dataType: cached.dataType ?? 'any' };
        }
      }

      await get().runPipeline({ reuse_outputs: reuseOutputs });
    },

    /**
     * Runs a single node in isolation with mock inputs.
     * Sends a synthetic single-node graph with the mock values as reuse_outputs
     * for virtual "upstream" nodes.
     *
     * @param {string} nodeId
     * @param {Object} mockInputs - { handleId: value, ... }
     * @returns {Object} - { output, dataType, error }
     */
    runNodeTest: async (nodeId, mockInputs) => {
      const { nodes, edges } = get();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { error: { message: 'Node not found' } };

      // Build a synthetic graph: just this node
      const syntheticNodes = [node];

      // For each mock input, create a fake source node + edge
      const syntheticEdges = [];
      const syntheticReuse = {};
      for (const [handleId, value] of Object.entries(mockInputs)) {
        const fakeNodeId = `mock-${handleId}`;
        syntheticNodes.push({ id: fakeNodeId, type: 'text', data: { execution: { kind: 'template' }, content: '' } });
        syntheticEdges.push({
          id: `mock-edge-${handleId}`,
          source: fakeNodeId,
          target: nodeId,
          targetHandle: `${nodeId}-${handleId}`,
          sourceHandle: `${fakeNodeId}-output`,
          type: 'typed',
          data: { dataType: 'any' },
        });
        syntheticReuse[fakeNodeId] = { value, output: value, dataType: 'any' };
      }

      try {
        const r = await fetch(`${BACKEND_URL}/pipelines/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nodes: syntheticNodes,
            edges: syntheticEdges,
            reuse_outputs: syntheticReuse,
            is_development: true,
          }),
        });
        if (!r.ok) return { error: { message: `HTTP ${r.status}` } };
        const { run_id, stream_url } = await r.json();

        // Read the SSE stream to completion and return the test node's output.
        return new Promise((resolve) => {
          let result = {};
          const evtSource = new EventSource(`${BACKEND_URL}${stream_url}`);
          evtSource.onmessage = (e) => {
            let event;
            try { event = JSON.parse(e.data); } catch { return; }
            if (event.type === 'node_output' && event.nodeId === nodeId) {
              result = { output: event.output, dataType: event.dataType };
            }
            if (event.type === 'node_error' && event.nodeId === nodeId) {
              result = { error: event.error };
            }
            if (event.type === 'pipeline_completed' || event.type === 'execution_error') {
              evtSource.close();
              resolve(result);
            }
          };
          evtSource.onerror = () => {
            evtSource.close();
            resolve({ error: { message: 'Stream error' } });
          };
        });
      } catch (e) {
        return { error: { message: e.message } };
      }
    },

    /**
     * Resumes a suspended run with the user's inline response.
     * Fetches the callback_token from the DB, calls /resume, then re-subscribes.
     *
     * @param {string} value - The human's response text.
     */
    resumeRun: async (value) => {
      const { suspendedRun, nodes, edges } = get();
      if (!suspendedRun) return;

      const { runId, nodeId } = suspendedRun;

      try {
        // Fetch the callback_token from the DB (not in the SSE event).
        const runRes = await fetch(`${BACKEND_URL}/runs/${runId}`);
        if (!runRes.ok) { set({ runStatus: 'error' }); return; }
        const runData = await runRes.json();
        const callbackToken = runData.suspension_context?.callback_token;
        if (!callbackToken) { set({ runStatus: 'error' }); return; }

        // Call the resume endpoint — writes the value to node_outputs and restarts the engine.
        const resumeRes = await fetch(`${BACKEND_URL}/runs/${runId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value, callback_token: callbackToken }),
        });
        if (!resumeRes.ok) { set({ runStatus: 'error' }); return; }

        // Re-subscribe to the SSE stream for the resumed execution.
        set({
          runStatus: 'running',
          suspendedRun: null,
          nodes: nodes.map((n) =>
            n.id === nodeId
              ? { ...n, data: { ...n.data, executionState: 'running' } }
              : n,
          ),
        });

        const streamUrl = `/runs/${runId}/stream`;
        _subscribeToRunStream(`${BACKEND_URL}${streamUrl}`, runId, get, set);

      } catch {
        set({ runStatus: 'error' });
      }
    },

    deleteNode: (nodeId) => {
      if (get().dagStatus !== 'pristine') _clearHighlight(set);
      set({
        nodes: get().nodes.filter((n) => n.id !== nodeId),
        edges: get().edges.filter(
          (e) => e.source !== nodeId && e.target !== nodeId,
        ),
      });
    },

    duplicateNode: (nodeId) => {
      const original = get().nodes.find((n) => n.id === nodeId);
      if (!original) return;
      const newId = get().getNodeID(original.type);
      const copy = {
        ...original,
        id: newId,
        position: { x: original.position.x + 40, y: original.position.y + 40 },
        data: { ...original.data, id: newId },
        selected: false,
      };
      if (get().dagStatus !== 'pristine') _clearHighlight(set);
      set({ nodes: [...get().nodes, copy] });
    },

    // Connection mode — active while the user is dragging a wire.
    connectionMode: null,
    startConnection: (sourceNodeId, sourceHandleId, sourceDataType) =>
      set({ connectionMode: { sourceNodeId, sourceHandleId, sourceDataType } }),
    endConnection: () => set({ connectionMode: null }),

    // Command palette — opened by Ctrl+K or wire drop on empty canvas.
    paletteOpen: false,
    paletteFilter: null,
    paletteDropPos: null,
    openPalette: (filter = null, pos = null) =>
      set({ paletteOpen: true, paletteFilter: filter, paletteDropPos: pos }),
    closePalette: () =>
      set({ paletteOpen: false, paletteFilter: null, paletteDropPos: null }),

    // Context menu — one at a time, keyed by surface type.
    contextMenu: null,
    openContextMenu: (type, x, y, target) =>
      set({ contextMenu: { type, x, y, target } }),
    closeContextMenu: () => set({ contextMenu: null }),

    // Inspector — the floating config panel; holds the id of the node being edited.
    inspectorNodeId: null,
    openInspector: (nodeId) => set({ inspectorNodeId: nodeId }),
    closeInspector: () => set({ inspectorNodeId: null }),

    // AI panel — conversational code-gen panel, opened from aiAssisted fields.
    // aiPanelKey identifies which node+field triggered the panel.
    // aiConversations stores message history keyed by "nodeId/fieldName".
    aiPanelKey: null,
    aiConversations: {},
    openAiPanel: (nodeId, fieldName) => set({ aiPanelKey: { nodeId, fieldName } }),
    closeAiPanel: () => set({ aiPanelKey: null }),
    appendAiMessage: (nodeId, fieldName, message) => {
      const key = `${nodeId}/${fieldName}`;
      set((state) => ({
        aiConversations: {
          ...state.aiConversations,
          [key]: [...(state.aiConversations[key] || []), message],
        },
      }));
    },

    // DAG status — result of the last /pipelines/parse submission.
    // 'pristine' : not yet checked, or graph has changed since last check
    // 'pending'  : fetch in flight — button disabled
    // 'valid'    : backend confirmed is_dag: true
    // 'invalid'  : backend confirmed is_dag: false (graph contains a cycle)
    dagStatus: 'pristine',

    // nodeRoles — per-node visual categorisation from the last parse result.
    // 'outer'         : runs in the main topological execution order
    // 'subgraph'      : runs inside a loop executor body (not outer pipeline)
    // 'tool'          : fn-schema source — agent calls it internally at runtime
    // 'cycle'         : part of or blocked by a cycle (invalid graph)
    // 'cycle-terminus': the specific node whose outgoing edge closes the cycle
    nodeRoles: {},

    submitPipeline: async () => {
      set({ dagStatus: 'pending' });
      const { nodes, edges } = get();
      try {
        const response = await fetch(`${BACKEND_URL}/pipelines/parse`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodes, edges }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        // Build role map from the parse result.
        const roles = {};
        (data.topo_order ?? []).forEach((id) => { roles[id] = 'outer'; });
        (data.subgraph_members ?? []).forEach((id) => { roles[id] = 'subgraph'; });
        (data.tool_nodes ?? []).forEach((id) => { roles[id] = 'tool'; });
        (data.cycle_nodes ?? []).forEach((id) => { roles[id] = 'cycle'; });
        // cycle-terminus overwrites 'cycle' for the specific back-edge sources
        (data.cycle_back_edge_sources ?? []).forEach((id) => { roles[id] = 'cycle-terminus'; });

        // Stamp back-edges on matching edges so TypedEdge can render them red.
        const backEdgeSources = new Set(data.cycle_back_edge_sources ?? []);
        const cycleNodeSet = new Set(data.cycle_nodes ?? []);
        const stampedEdges = get().edges.map((e) =>
          backEdgeSources.has(e.source) && cycleNodeSet.has(e.target)
            ? { ...e, data: { ...e.data, isBackEdge: true } }
            : { ...e, data: { ...e.data, isBackEdge: false } }
        );

        set({
          dagStatus: data.is_dag ? 'valid' : 'invalid',
          nodeRoles: roles,
          edges: stampedEdges,
        });

        _scheduleHighlightClear(set);
      } catch {
        set({ dagStatus: 'invalid', nodeRoles: {} });
      }
    },
  }));
