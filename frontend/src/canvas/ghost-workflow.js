/**
 * GhostWorkflow — a semi-transparent example pipeline shown on an empty canvas.
 *
 * Design intent (DESIGN-VISION.md): renders at opacity 0.18, brightens to 0.55
 * on hover, and vanishes (600ms transition) once the user places a real node.
 * Clicking a ghost node promotes it to a real node in the store.
 *
 * Implemented as an absolute overlay that sits above the ReactFlow canvas, not
 * as RF nodes — this avoids polluting the user's node/edge state and lets us
 * control visibility independently.
 */
import { useState, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { CATEGORY_COLORS, NODE_CARD } from '../styles/design-tokens';

const GHOST_NODES = [
  { type: 'customInput',  label: 'Your prompt goes here', hint: 'Start here', x: 80,  y: 180 },
  { type: 'llm',          label: 'Your AI runs here',     hint: 'Pick a model', x: 360, y: 120 },
  { type: 'customOutput', label: 'See the result',        hint: 'End here', x: 640, y: 180 },
];

const GHOST_EDGES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
];

const storeSelector = (s) => ({
  nodes:      s.nodes,
  addNode:    s.addNode,
  getNodeID:  s.getNodeID,
});

const ghostWrapperStyle = {
  position: 'absolute',
  inset: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
  zIndex: 0,
};

const ghostCardStyle = (category, hovered) => ({
  position: 'absolute',
  width: NODE_CARD.width,
  minHeight: NODE_CARD.minHeight,
  background: NODE_CARD.background,
  border: `1px solid ${NODE_CARD.borderDefault}`,
  borderTop: `1px solid ${NODE_CARD.borderTop}`,
  borderRadius: NODE_CARD.borderRadius,
  boxShadow: NODE_CARD.shadowOuter,
  padding: '10px 12px',
  fontFamily: 'Inter, sans-serif',
  cursor: 'pointer',
  pointerEvents: 'all',
  opacity: hovered ? 0.55 : 0.18,
  transition: 'opacity 200ms ease',
  userSelect: 'none',
  borderLeft: `3px solid ${CATEGORY_COLORS[NODE_SPECS[category]?.category] ?? 'rgba(255,255,255,0.15)'}`,
});

const ghostLabelStyle = {
  color: 'rgba(255,255,255,0.85)',
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 2,
};

const ghostHintStyle = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 11,
  fontWeight: 400,
};

function GhostEdge({ fromNode, toNode }) {
  const fx = fromNode.x + NODE_CARD.width;
  const fy = fromNode.y + NODE_CARD.minHeight / 2;
  const tx = toNode.x;
  const ty = toNode.y + NODE_CARD.minHeight / 2;
  const cx = (fx + tx) / 2;

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      overflow="visible"
    >
      <path
        d={`M ${fx} ${fy} C ${cx} ${fy} ${cx} ${ty} ${tx} ${ty}`}
        fill="none"
        stroke="rgba(255,255,255,0.10)"
        strokeWidth={1.5}
        strokeDasharray="4 4"
      />
    </svg>
  );
}

function GhostNode({ ghostDef, onPromote }) {
  const [hovered, setHovered] = useState(false);
  const spec = NODE_SPECS[ghostDef.type];

  return (
    <div
      data-testid={`ghost-node-${ghostDef.type}`}
      style={{ ...ghostCardStyle(ghostDef.type, hovered), left: ghostDef.x, top: ghostDef.y }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => onPromote(ghostDef)}
      title={`Click to add ${spec?.title ?? ghostDef.type} to your canvas`}
    >
      <div style={ghostLabelStyle}>{ghostDef.label}</div>
      <div style={ghostHintStyle}>{ghostDef.hint}</div>
    </div>
  );
}

export function GhostWorkflow() {
  const { nodes, addNode, getNodeID } = useStore(storeSelector, shallow);

  const promoteNode = useCallback(
    (ghostDef) => {
      const nodeId = getNodeID(ghostDef.type);
      const spec = NODE_SPECS[ghostDef.type];
      const data = { id: nodeId, nodeType: ghostDef.type };
      spec?.fields.forEach((f) => {
        if (f.default !== undefined) data[f.name] = f.default;
      });
      addNode({
        id: nodeId,
        type: ghostDef.type,
        position: { x: ghostDef.x, y: ghostDef.y },
        data,
      });
    },
    [getNodeID, addNode],
  );

  if (nodes.length > 0) return null;

  return (
    <div data-testid="ghost-workflow" style={ghostWrapperStyle}>
      {GHOST_EDGES.map((e, i) => (
        <GhostEdge key={i} fromNode={GHOST_NODES[e.from]} toNode={GHOST_NODES[e.to]} />
      ))}
      {GHOST_NODES.map((gn) => (
        <GhostNode key={gn.type} ghostDef={gn} onPromote={promoteNode} />
      ))}
    </div>
  );
}
