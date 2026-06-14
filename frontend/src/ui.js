/**
 * PipelineUI — the React Flow canvas with all interaction systems wired in:
 *   - Dock (bottom)
 *   - CommandPalette (Ctrl/Cmd+K or wire-drop triggered)
 *   - ContextMenu (right-click on node, edge, or canvas)
 *   - Connection mode (dims canvas + highlights compatible nodes)
 *   - GhostWorkflow (semi-transparent example shown on first open)
 */
import { useEffect, useRef, useCallback } from 'react';
import ReactFlow, { Controls, Background, BackgroundVariant, MiniMap } from 'reactflow';
import { shallow } from 'zustand/shallow';
import { useStore } from './store';
import { nodeTypes } from './nodes/nodeRegistry';
import { NODE_SPECS, isConnectionValid } from './nodes/nodeSpecs';
import { TypedEdge } from './edges/typed-edge';
import { ConnectionLine } from './edges/connection-line';
import { Dock } from './canvas/dock';
import { CommandPalette } from './canvas/command-palette';
import { ContextMenu } from './canvas/context-menu';
import { Inspector } from './canvas/inspector';
import { GhostWorkflow } from './canvas/ghost-workflow';
import { GlobalStatePanel } from './canvas/global-state-panel';
import { NodeInspectionCard } from './canvas/node-inspection-card';
import { NodeTestPanel } from './canvas/node-test-panel';
import { SuspensionModal } from './canvas/suspension-modal';
import { CANVAS } from './styles/design-tokens';
import 'reactflow/dist/style.css';

const edgeTypes = { typed: TypedEdge };
const proOptions = { hideAttribution: true };

const selector = (state) => ({
  nodes:            state.nodes,
  edges:            state.edges,
  getNodeID:        state.getNodeID,
  addNode:          state.addNode,
  onNodesChange:    state.onNodesChange,
  onEdgesChange:    state.onEdgesChange,
  onConnect:        state.onConnect,
  setRFInstance:    state.setRFInstance,
  rfInstance:       state.rfInstance,
  startConnection:  state.startConnection,
  endConnection:    state.endConnection,
  openPalette:      state.openPalette,
  openContextMenu:  state.openContextMenu,
  closeContextMenu: state.closeContextMenu,
  openInspector:    state.openInspector,
  closeInspector:   state.closeInspector,
  statePanelOpen:   state.statePanelOpen,
  inspectedNodeId:  state.inspectedNodeId,
  testPanelNodeId:  state.testPanelNodeId,
});

const buildInitialData = (nodeId, type) => {
  const spec = NODE_SPECS[type];
  const data = {
    id: nodeId,
    nodeType: type,
    execution: spec?.execution ? { ...spec.execution } : undefined,
  };
  spec?.fields.forEach((field) => {
    if (field.default !== undefined) data[field.name] = field.default;
  });
  return data;
};

export const PipelineUI = () => {
  const reactFlowWrapper = useRef(null);
  const {
    nodes, edges,
    getNodeID, addNode,
    onNodesChange, onEdgesChange, onConnect,
    setRFInstance, rfInstance,
    startConnection, endConnection,
    openPalette,
    openContextMenu, closeContextMenu,
    openInspector, closeInspector,
    statePanelOpen, inspectedNodeId, testPanelNodeId,
  } = useStore(selector, shallow);

  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        openPalette();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [openPalette]);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const transferred = event.dataTransfer?.getData('application/reactflow');
      if (!transferred) return;
      const { nodeType } = JSON.parse(transferred);
      if (!nodeType) return;

      const instance = rfInstance ?? useStore.getState().rfInstance;
      if (!instance) return;

      const position = instance.screenToFlowPosition
        ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        : instance.project({
            x: event.clientX - reactFlowWrapper.current.getBoundingClientRect().left,
            y: event.clientY - reactFlowWrapper.current.getBoundingClientRect().top,
          });

      const nodeId = getNodeID(nodeType);
      addNode({
        id: nodeId,
        type: nodeType,
        position,
        data: buildInitialData(nodeId, nodeType),
      });
    },
    [rfInstance, getNodeID, addNode],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onConnectStart = useCallback(
    (_, { nodeId, handleId, handleType }) => {
      if (handleType !== 'source') return;
      const node = nodes.find((n) => n.id === nodeId);
      const spec = node && NODE_SPECS[node.type];
      const handle = spec?.handles.find((h) => `${nodeId}-${h.id}` === handleId);
      startConnection(nodeId, handleId, handle?.dataType ?? 'any');
    },
    [nodes, startConnection],
  );

  const onConnectEnd = useCallback(
    (event) => {
      endConnection();

      if (!event.target?.closest('.react-flow__handle')) {
        const instance = rfInstance ?? useStore.getState().rfInstance;
        const pos = instance?.screenToFlowPosition
          ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
          : null;
        const { connectionMode: cm } = useStore.getState();
        if (cm) openPalette(cm.sourceDataType, pos);
      }
    },
    [endConnection, rfInstance, openPalette],
  );

  const onNodeContextMenu = useCallback(
    (event, node) => {
      event.preventDefault();
      closeContextMenu();
      openContextMenu('node', event.clientX, event.clientY, { id: node.id });
    },
    [openContextMenu, closeContextMenu],
  );

  const onEdgeContextMenu = useCallback(
    (event, edge) => {
      event.preventDefault();
      closeContextMenu();
      openContextMenu('edge', event.clientX, event.clientY, edge);
    },
    [openContextMenu, closeContextMenu],
  );

  const onPaneContextMenu = useCallback(
    (event) => {
      event.preventDefault();
      closeContextMenu();
      openContextMenu('pane', event.clientX, event.clientY, { x: event.clientX, y: event.clientY });
    },
    [openContextMenu, closeContextMenu],
  );

  const onNodeClick = useCallback(
    (_, node) => openInspector(node.id),
    [openInspector],
  );

  const onPaneClick = useCallback(() => {
    closeContextMenu();
    closeInspector();
  }, [closeContextMenu, closeInspector]);

  const wrapperStyle = {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    background: CANVAS.background,
  };

  return (
    <div ref={reactFlowWrapper} style={wrapperStyle}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        isValidConnection={(connection) => isConnectionValid(connection, nodes, edges)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onInit={setRFInstance}
        onNodeClick={onNodeClick}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={onPaneClick}
        proOptions={proOptions}
        snapGrid={[CANVAS.gridInterval, CANVAS.gridInterval]}
        connectionLineComponent={ConnectionLine}
        style={{ width: '100%', height: '100%' }}
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
        <GhostWorkflow />
      </ReactFlow>

      <Dock />
      <CommandPalette />
      <ContextMenu />
      <Inspector />
      {statePanelOpen && <GlobalStatePanel />}
      {inspectedNodeId && <NodeInspectionCard />}
      {testPanelNodeId && <NodeTestPanel />}
      <SuspensionModal />
    </div>
  );
};
