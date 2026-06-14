/**
 * Pipeline store — central state for nodes, edges, and canvas interaction.
 *
 * Core systems:
 *   - Connection mode: tracks dragging state.
 *   - Command palette: node search and placement.
 *   - Context menu: surface-specific actions.
 *   - DAG status: validation results.
 *   - nodeRoles: per-node categorisation from analysis.
 *   - nodeOutputCache: execution results for inspection.
 *   - globalState: run variables and history.
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

let _highlightTimer = null;

/**
 * Subscribes to run events via SSE.
 */
function _subscribeToRunStream(streamUrl, get, set) {
  const evtSource = new EventSource(streamUrl);

  evtSource.onmessage = (e) => {
    let event;
    try { event = JSON.parse(e.data); } catch { return; }

    const state = get();
    const patch = handleSseEvent(event, state);
    if (patch) set(patch);

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

    evtSource.onerror = (err) => {
      console.error('SSE Error:', err);
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
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },
    onEdgesChange: (changes) => {
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

      if (get().dagStatus !== 'pristine') _clearHighlight(set);

      set({
        edges: addEdge({ ...connection, type: 'typed', data: { dataType } }, get().edges),
      });
    },
    updateNodeField: (nodeId, fieldName, fieldValue) => {
      const { nodes, edges, staleNodeIds } = get();

      const internalFields = new Set(['executionState', 'receivedPayload', 'payloadFields', 'testMode', 'samplePayload']);
      const nextStale = internalFields.has(fieldName)
        ? staleNodeIds
        : new Set([...staleNodeIds, ...getStaleNodeIds(nodeId, nodes, edges)]);

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
    },

    updateNodeData: (nodeId, dataUpdates) => {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...dataUpdates } }
            : node,
        ),
      });
    },

    activeRunId: null,
    runStatus: 'idle',
    nodeOutputCache: {},
    globalState: { messages: [], variables: {} },
    staleNodeIds: new Set(),

    statePanelOpen: false,
    openStatePanel: () => set({ statePanelOpen: true }),
    closeStatePanel: () => set({ statePanelOpen: false }),
    toggleStatePanel: () => set((s) => ({ statePanelOpen: !s.statePanelOpen })),

    inspectedNodeId: null,
    openInspectionCard: (nodeId) => set({ inspectedNodeId: nodeId }),
    closeInspectionCard: () => set({ inspectedNodeId: null }),

    testPanelNodeId: null,
    openTestPanel: (nodeId) => set({ testPanelNodeId: nodeId }),
    closeTestPanel: () => set({ testPanelNodeId: null }),

    suspendedRun: null,

    /**
     * Executes the full pipeline.
     */
    runPipeline: async ({ reuse_outputs } = {}) => {
      const { nodes, edges } = get();

      let triggerPayload = {};
      const webhookNode = nodes.find((n) => n.type === 'webhook' && n.data.testMode === true);
      if (webhookNode?.data?.samplePayload) {
        try { triggerPayload = JSON.parse(webhookNode.data.samplePayload); } catch { }
      }

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

        _subscribeToRunStream(`${BACKEND_URL}${stream_url}`, get, set);

      } catch {
        set({ runStatus: 'error', activeRunId: null });
      }
    },

    /**
     * Re-runs the pipeline starting from a specific node, reusing previous results.
     */
    runFromNode: async (fromNodeId) => {
      const { nodes, nodeOutputCache, staleNodeIds } = get();
      const stale = staleNodeIds.size > 0 ? staleNodeIds : getStaleNodeIds(fromNodeId, nodes, get().edges);

      const reuseOutputs = {};
      for (const [nodeId, cached] of Object.entries(nodeOutputCache)) {
        if (!stale.has(nodeId) && cached.output !== undefined) {
          reuseOutputs[nodeId] = { value: cached.output, output: cached.output, dataType: cached.dataType ?? 'any' };
        }
      }

      await get().runPipeline({ reuse_outputs: reuseOutputs });
    },

    /**
     * Tests a single node with mock inputs.
     */
    runNodeTest: async (nodeId, mockInputs) => {
      const { nodes, edges } = get();
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return { error: { message: 'Node not found' } };

      const syntheticNodes = [node];
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
     * Resumes a suspended run.
     */
    resumeRun: async (value) => {
      const { suspendedRun, nodes, edges } = get();
      if (!suspendedRun) return;

      const { runId, nodeId } = suspendedRun;

      try {
        const runRes = await fetch(`${BACKEND_URL}/runs/${runId}`);
        if (!runRes.ok) { set({ runStatus: 'error' }); return; }
        const runData = await runRes.json();
        const callbackToken = runData.suspension_context?.callback_token;
        if (!callbackToken) { set({ runStatus: 'error' }); return; }

        const resumeRes = await fetch(`${BACKEND_URL}/runs/${runId}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value, callback_token: callbackToken }),
        });
        if (!resumeRes.ok) { set({ runStatus: 'error' }); return; }

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
        _subscribeToRunStream(`${BACKEND_URL}${streamUrl}`, get, set);

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

    connectionMode: null,
    startConnection: (sourceNodeId, sourceHandleId, sourceDataType) =>
      set({ connectionMode: { sourceNodeId, sourceHandleId, sourceDataType } }),
    endConnection: () => set({ connectionMode: null }),

    paletteOpen: false,
    paletteFilter: null,
    paletteDropPos: null,
    openPalette: (filter = null, pos = null) =>
      set({ paletteOpen: true, paletteFilter: filter, paletteDropPos: pos }),
    closePalette: () =>
      set({ paletteOpen: false, paletteFilter: null, paletteDropPos: null }),

    contextMenu: null,
    openContextMenu: (type, x, y, target) =>
      set({ contextMenu: { type, x, y, target } }),
    closeContextMenu: () => set({ contextMenu: null }),

    inspectorNodeId: null,
    openInspector: (nodeId) => set({ inspectorNodeId: nodeId }),
    closeInspector: () => set({ inspectorNodeId: null }),

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

    dagStatus: 'pristine',
    nodeRoles: {},

    /**
     * Validates graph topology.
     */
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

        const roles = {};
        (data.topo_order ?? []).forEach((id) => { roles[id] = 'outer'; });
        (data.subgraph_members ?? []).forEach((id) => { roles[id] = 'subgraph'; });
        (data.tool_nodes ?? []).forEach((id) => { roles[id] = 'tool'; });
        (data.cycle_nodes ?? []).forEach((id) => { roles[id] = 'cycle'; });
        (data.cycle_back_edge_sources ?? []).forEach((id) => { roles[id] = 'cycle-terminus'; });

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
