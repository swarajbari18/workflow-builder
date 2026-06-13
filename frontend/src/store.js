// store.js

import { create } from "zustand";
import {
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
  } from 'reactflow';
import { NODE_SPECS } from './nodes/nodeSpecs';

export const useStore = create((set, get) => ({
    nodes: [],
    edges: [],
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
    },
  }));
