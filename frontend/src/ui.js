/**
 * PipelineUI — the React Flow canvas.
 *
 * Renders every node through the spec-driven registry, seeds new nodes with their
 * default field values, and validates proposed edges before they are created.
 */
import { useState, useRef, useCallback } from 'react';
import ReactFlow, { Controls, Background, BackgroundVariant, MiniMap } from 'reactflow';
import { shallow } from 'zustand/shallow';
import { useStore } from './store';
import { nodeTypes } from './nodes/nodeRegistry';
import { NODE_SPECS, isConnectionValid } from './nodes/nodeSpecs';
import { TypedEdge } from './edges/typed-edge';
import { CANVAS } from './styles/design-tokens';
import 'reactflow/dist/style.css';

const edgeTypes = { typed: TypedEdge };

const proOptions = { hideAttribution: true };

const selector = (state) => ({
  nodes: state.nodes,
  edges: state.edges,
  getNodeID: state.getNodeID,
  addNode: state.addNode,
  onNodesChange: state.onNodesChange,
  onEdgesChange: state.onEdgesChange,
  onConnect: state.onConnect,
});

/**
 * Builds the initial `data` for a new node, seeded with its spec's default field
 * values so the node carries sensible values (and conditional fields resolve)
 * before the user edits anything.
 *
 * @param {string} nodeId
 * @param {string} type
 * @returns {Object}
 */
const buildInitialData = (nodeId, type) => {
  const data = { id: nodeId, nodeType: type };
  NODE_SPECS[type]?.fields.forEach((field) => {
    if (field.default !== undefined) data[field.name] = field.default;
  });
  return data;
};

export const PipelineUI = () => {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const { nodes, edges, getNodeID, addNode, onNodesChange, onEdgesChange, onConnect } = useStore(selector, shallow);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();

      const transferred = event.dataTransfer?.getData('application/reactflow');
      if (!transferred) return;
      const { nodeType } = JSON.parse(transferred);
      if (!nodeType) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const nodeId = getNodeID(nodeType);
      addNode({ id: nodeId, type: nodeType, position, data: buildInitialData(nodeId, nodeType) });
    },
    [reactFlowInstance, getNodeID, addNode],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  return (
    <div ref={reactFlowWrapper} style={{ width: '100vw', height: '70vh', background: CANVAS.background }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={(connection) => isConnectionValid(connection, nodes, edges)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={setReactFlowInstance}
        proOptions={proOptions}
        snapGrid={[CANVAS.gridInterval, CANVAS.gridInterval]}
        connectionLineType="bezier"
      >
        <Background
          variant={BackgroundVariant.Dots}
          color={CANVAS.gridDotColor}
          gap={CANVAS.gridInterval}
        />
        <Controls />
        <MiniMap
          nodeColor="#2D2D30"
          nodeStrokeColor="rgba(255,255,255,0.10)"
          maskColor="rgba(13,13,15,0.80)"
          style={{ background: '#1A1A1E', border: '1px solid rgba(255,255,255,0.08)' }}
        />
      </ReactFlow>
    </div>
  );
};
