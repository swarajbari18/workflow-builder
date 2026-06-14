/**
 * Pipeline store — central state for nodes, edges, and canvas interaction.
 *
 * Three interaction systems live here alongside the core node/edge state:
 *   - Connection mode: tracks what the user is dragging and from where,
 *     so the canvas can dim incompatible nodes and open the palette on drop.
 *   - Command palette: open/close with optional data-type filter for wire drops.
 *   - Context menu: one menu at a time, typed by the surface it was opened on.
 *   - DAG status: 'pristine' | 'pending' | 'valid' | 'invalid' — tracks the
 *     result of the last /pipelines/parse call. Resets to 'pristine' on any
 *     structural graph change (nodes or edges) so the indicator always reflects
 *     the current graph, not a previous one.
 */
import { create } from "zustand";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
  } from 'reactflow';
import { NODE_SPECS } from './nodes/nodeSpecs';

const BACKEND_URL = 'http://localhost:8000';

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
      // Any structural change (add, remove, position) invalidates the last DAG check.
      if (get().dagStatus !== 'pristine') set({ dagStatus: 'pristine' });
      set({
        nodes: applyNodeChanges(changes, get().nodes),
      });
    },
    onEdgesChange: (changes) => {
      // Any edge change (add or remove) may introduce or remove a cycle.
      if (get().dagStatus !== 'pristine') set({ dagStatus: 'pristine' });
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
      if (get().dagStatus !== 'pristine') set({ dagStatus: 'pristine' });

      set({
        edges: addEdge({ ...connection, type: 'typed', data: { dataType } }, get().edges),
      });
    },
    // Returns a new node object (rather than mutating in place) so React Flow
    // reliably detects the data change and re-renders the affected node.
    updateNodeField: (nodeId, fieldName, fieldValue) => {
      set({
        nodes: get().nodes.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, [fieldName]: fieldValue } }
            : node,
        ),
      });
      // Deliberately does NOT reset dagStatus — field values do not affect
      // graph topology, so the DAG result is still valid for the current structure.
    },

    deleteNode: (nodeId) => {
      if (get().dagStatus !== 'pristine') set({ dagStatus: 'pristine' });
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
      if (get().dagStatus !== 'pristine') set({ dagStatus: 'pristine' });
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

    // DAG status — result of the last /pipelines/parse submission.
    // 'pristine' : not yet checked, or graph has changed since last check
    // 'pending'  : fetch in flight — button disabled
    // 'valid'    : backend confirmed is_dag: true
    // 'invalid'  : backend confirmed is_dag: false (graph contains a cycle)
    dagStatus: 'pristine',

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
        set({ dagStatus: data.is_dag ? 'valid' : 'invalid' });
      } catch {
        set({ dagStatus: 'invalid' });
      }
    },
  }));
