/**
 * NodeInspectionCard — floating card showing node execution results.
 * READ-ONLY — backward-looking view.
 * Right-click → "Inspect output" to open.
 *
 * Four sections:
 *   1. Output — what this node produced
 *   2. Inputs received — what arrived at each target handle
 *   3. Timing — duration and start time
 *   4. Error — rendered when the node errored
 */
import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { ValueDisplay } from './value-display';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { NODE_CARD, DATA_TYPE_COLORS } from '../styles/design-tokens';

const cardStyle = {
  position: 'fixed',
  top: '50%',
  right: 12,
  transform: 'translateY(-50%)',
  width: 400,
  maxHeight: '80vh',
  overflowY: 'auto',
  zIndex: 1800,
  background: NODE_CARD.background,
  border: `1px solid rgba(255,255,255,0.10)`,
  borderRadius: NODE_CARD.borderRadius,
  boxShadow: [NODE_CARD.shadowOuter, NODE_CARD.shadowRing, NODE_CARD.shadowInner].join(', '),
  fontFamily: 'Inter, sans-serif',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const titleStyle = {
  fontSize: 12,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.85)',
};

const subTitleStyle = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.40)',
  marginTop: 2,
};

const closeBtn = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.40)',
  fontSize: 16,
  padding: '2px 4px',
};

const sectionStyle = {
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  padding: '12px 14px',
};

const sectionLabelStyle = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 8,
};

const handleRowStyle = {
  marginBottom: 10,
};

const handleLabelStyle = {
  fontSize: 10,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.45)',
  marginBottom: 4,
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const typeDot = (color) => ({
  display: 'inline-block',
  width: 6,
  height: 6,
  borderRadius: '50%',
  background: color && color !== 'rainbow' ? color : '#8E8E93',
  flexShrink: 0,
});

const timingRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 12,
  color: 'rgba(255,255,255,0.75)',
  marginBottom: 4,
};

const timingValueStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.55)',
  fontVariantNumeric: 'tabular-nums',
};

const errorStyle = {
  background: 'rgba(255,59,48,0.08)',
  border: '1px solid rgba(255,59,48,0.2)',
  borderRadius: 8,
  padding: '10px 12px',
};

const errorMsgStyle = {
  fontSize: 12,
  color: '#FF3B30',
  marginBottom: 6,
};

const errorDetailStyle = {
  fontSize: 11,
  color: 'rgba(255,59,48,0.65)',
  fontFamily: 'monospace',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  marginTop: 6,
};

function formatMs(seconds) {
  if (seconds === undefined || seconds === null) return '—';
  return `${Math.round(seconds * 1000).toLocaleString()} ms`;
}

function OutputSection({ cached }) {
  if (!cached || cached.output === undefined) {
    const msg = cached?.executionState === 'skipped'
      ? 'Skipped — inactive branch.'
      : 'No output captured yet.';
    return (
      <div style={sectionStyle}>
        <div style={sectionLabelStyle}>Output</div>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
          {msg}
        </span>
      </div>
    );
  }
  const color = DATA_TYPE_COLORS[cached.dataType];
  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>
        Output
        <span style={{ ...typeDot(color), marginLeft: 6, display: 'inline-block' }} />
        <span style={{ marginLeft: 4, textTransform: 'none', letterSpacing: 0, fontSize: 10, color: 'rgba(255,255,255,0.40)' }}>
          {cached.dataType ?? 'any'}
        </span>
      </div>
      <ValueDisplay value={cached.output} dataType={cached.dataType} />
    </div>
  );
}

function InputsSection({ nodeId, nodes, edges, nodeOutputCache }) {
  const node = nodes.find((n) => n.id === nodeId);
  const spec = node && NODE_SPECS[node.type];
  const targetHandles = spec?.handles.filter((h) => h.kind === 'target') ?? [];

  if (targetHandles.length === 0) return null;

  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Inputs received</div>
      {targetHandles.map((handle) => {
        const fullHandleId = `${nodeId}-${handle.id}`;
        const edge = edges.find((e) => e.targetHandle === fullHandleId);
        const upstream = edge ? nodeOutputCache[edge.source] : null;
        const value = upstream?.output;
        const color = DATA_TYPE_COLORS[handle.dataType];
        return (
          <div key={handle.id} style={handleRowStyle}>
            <div style={handleLabelStyle}>
              <span style={typeDot(color)} />
              {handle.label ?? handle.id}
            </div>
            {value !== undefined
              ? <ValueDisplay value={value} dataType={handle.dataType} />
              : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.30)', fontStyle: 'italic' }}>Not connected</span>
            }
          </div>
        );
      })}
    </div>
  );
}

function TimingSection({ cached }) {
  if (!cached?.startedAt && !cached?.duration) return null;
  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Timing</div>
      {cached.startedAt && (
        <div style={timingRowStyle}>
          <span>Started</span>
          <span style={timingValueStyle}>{new Date(cached.startedAt).toLocaleTimeString()}</span>
        </div>
      )}
      <div style={timingRowStyle}>
        <span>Duration</span>
        <span style={timingValueStyle}>{formatMs(cached.duration)}</span>
      </div>
    </div>
  );
}

function ErrorSection({ error }) {
  const [showDetail, setShowDetail] = useState(false);
  if (!error) return null;
  return (
    <div style={sectionStyle}>
      <div style={sectionLabelStyle}>Error</div>
      <div style={errorStyle}>
        <div style={errorMsgStyle}>{error.message ?? String(error)}</div>
        {error.detail && (
          <button
            style={{ ...closeBtn, fontSize: 11, color: 'rgba(255,59,48,0.6)', padding: 0 }}
            onClick={() => setShowDetail((s) => !s)}
          >
            {showDetail ? 'Hide detail ▴' : 'Show detail ▾'}
          </button>
        )}
        {showDetail && error.detail && (
          <pre style={errorDetailStyle}>{error.detail}</pre>
        )}
      </div>
    </div>
  );
}

const storeSelector = (s) => ({
  closeInspectionCard: s.closeInspectionCard,
  inspectedNodeId:     s.inspectedNodeId,
  nodeOutputCache:     s.nodeOutputCache,
  nodes:               s.nodes,
  edges:               s.edges,
});

export function NodeInspectionCard() {
  const { closeInspectionCard, inspectedNodeId, nodeOutputCache, nodes, edges } =
    useStore(storeSelector, shallow);

  const node = nodes.find((n) => n.id === inspectedNodeId);
  if (!node) return null;

  const cached = nodeOutputCache[inspectedNodeId];
  const nodeTitle = node.data?.label || NODE_SPECS[node.type]?.title || node.type;

  return (
    <div data-testid="node-inspection-card" style={cardStyle}>
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>{nodeTitle}</div>
          <div style={subTitleStyle}>Last run — read only</div>
        </div>
        <button style={closeBtn} onClick={closeInspectionCard} title="Close">×</button>
      </div>

      <OutputSection cached={cached} />
      <InputsSection nodeId={inspectedNodeId} nodes={nodes} edges={edges} nodeOutputCache={nodeOutputCache} />
      <TimingSection cached={cached} />
      <ErrorSection error={cached?.error} />
    </div>
  );
}
