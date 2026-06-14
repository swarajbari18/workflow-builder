/**
 * GlobalStatePanel — a 320px slide-in from the right showing the full run context.
 *
 * Three sections:
 *   1. Conversation — message[] from globalState.messages as a chat view
 *   2. Node Outputs — collapsible row per completed node in nodeOutputCache
 *   3. Variables — key/value pairs from globalState.variables
 *
 * Real Liquid Glass material (static, appears once). Triggered by the ◉ button
 * in the dock. Updates in real time as SSE events arrive during a run.
 */
import { useState, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { ValueDisplay } from './value-display';
import { LIQUID_GLASS, DATA_TYPE_COLORS } from '../styles/design-tokens';

const PANEL_WIDTH = 320;

const panelStyle = {
  position: 'fixed',
  top: 0,
  right: 0,
  width: PANEL_WIDTH,
  height: '100vh',
  zIndex: 2000,
  display: 'flex',
  flexDirection: 'column',
  background: LIQUID_GLASS.background,
  backdropFilter: LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter: LIQUID_GLASS.backdropFilter,
  borderLeft: `1px solid ${LIQUID_GLASS.borderDefault}`,
  boxShadow: '-4px 0 24px rgba(0,0,0,0.4)',
  fontFamily: 'Inter, sans-serif',
  overflowY: 'auto',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '18px 16px 12px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  flexShrink: 0,
};

const titleStyle = {
  fontSize: 13,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.9)',
};

const closeBtn = {
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'rgba(255,255,255,0.45)',
  fontSize: 16,
  padding: '2px 4px',
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px 8px',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.06em',
  color: 'rgba(255,255,255,0.40)',
  textTransform: 'uppercase',
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  cursor: 'pointer',
  userSelect: 'none',
};

const emptyStyle = {
  padding: '10px 16px',
  fontSize: 12,
  color: 'rgba(255,255,255,0.30)',
  fontStyle: 'italic',
};

const msgRoleStyle = (role) => ({
  fontSize: 10,
  fontWeight: 700,
  color: role === 'user' ? '#5AC8FA' : '#BF5AF2',
  marginBottom: 3,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

const msgBubbleStyle = (role) => ({
  background: role === 'user' ? 'rgba(90,200,250,0.08)' : 'rgba(191,90,242,0.08)',
  borderRadius: 8,
  padding: '8px 10px',
  marginBottom: 8,
});

const msgContentStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.85)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const nodeRowStyle = (expanded) => ({
  borderBottom: '1px solid rgba(255,255,255,0.05)',
  cursor: 'pointer',
  background: expanded ? 'rgba(255,255,255,0.04)' : 'transparent',
});

const nodeRowHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 16px',
};

const nodeNameStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.85)',
};

const typeBadgeStyle = (color) => ({
  fontSize: 9,
  fontWeight: 700,
  padding: '2px 5px',
  borderRadius: 4,
  background: color ? `${color}22` : 'rgba(255,255,255,0.08)',
  border: `1px solid ${color ?? 'rgba(255,255,255,0.15)'}`,
  color: color ?? 'rgba(255,255,255,0.5)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

const varRowStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 8,
  padding: '6px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
};

const varKeyStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.55)',
  flexShrink: 0,
  minWidth: 80,
};

const varValueStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.85)',
};

function ConversationSection({ messages }) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <div style={sectionHeaderStyle} onClick={() => setOpen((o) => !o)}>
        <span>Conversation</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ padding: '10px 16px' }}>
          {messages.length === 0
            ? <div style={emptyStyle}>No messages yet.</div>
            : messages.map((msg, i) => (
              <div key={i} style={msgBubbleStyle(msg.role)}>
                <div style={msgRoleStyle(msg.role)}>{msg.role}</div>
                <div style={msgContentStyle}>{msg.content}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function NodeOutputsSection({ nodeOutputCache, nodes }) {
  const [open, setOpen] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const entries = Object.entries(nodeOutputCache).filter(([, v]) => v.output !== undefined);

  const getNodeTitle = (nodeId) => {
    const node = nodes.find((n) => n.id === nodeId);
    return node?.data?.label || node?.type || nodeId;
  };

  return (
    <div>
      <div style={sectionHeaderStyle} onClick={() => setOpen((o) => !o)}>
        <span>Node Outputs</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div>
          {entries.length === 0
            ? <div style={emptyStyle}>No outputs yet — run the pipeline first.</div>
            : entries.map(([nodeId, cached]) => {
              const expanded = expandedId === nodeId;
              const color = DATA_TYPE_COLORS[cached.dataType] === 'rainbow' ? null : DATA_TYPE_COLORS[cached.dataType];
              return (
                <div
                  key={nodeId}
                  data-testid={`state-node-row-${nodeId}`}
                  style={nodeRowStyle(expanded)}
                  onClick={() => setExpandedId(expanded ? null : nodeId)}
                >
                  <div style={nodeRowHeaderStyle}>
                    <span style={nodeNameStyle}>{getNodeTitle(nodeId)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={typeBadgeStyle(color)}>{cached.dataType ?? 'any'}</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.30)' }}>
                        {expanded ? '▾' : '▸'}
                      </span>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: '4px 16px 12px' }}>
                      <ValueDisplay value={cached.output} dataType={cached.dataType} />
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function VariablesSection({ variables }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(variables ?? {});
  return (
    <div>
      <div style={sectionHeaderStyle} onClick={() => setOpen((o) => !o)}>
        <span>Variables</span>
        <span>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div>
          {entries.length === 0
            ? <div style={emptyStyle}>No global variables declared.</div>
            : entries.map(([key, val]) => (
              <div key={key} style={varRowStyle}>
                <span style={varKeyStyle}>{key}</span>
                <span style={varValueStyle}>{JSON.stringify(val)}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

const storeSelector = (s) => ({
  closeStatePanel: s.closeStatePanel,
  globalState:     s.globalState,
  nodeOutputCache: s.nodeOutputCache,
  nodes:           s.nodes,
});

export function GlobalStatePanel() {
  const { closeStatePanel, globalState, nodeOutputCache, nodes } =
    useStore(storeSelector, shallow);

  return (
    <div data-testid="global-state-panel" style={panelStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>◉  Run State</span>
        <button style={closeBtn} onClick={closeStatePanel} title="Close">×</button>
      </div>

      <ConversationSection messages={globalState.messages} />
      <NodeOutputsSection nodeOutputCache={nodeOutputCache} nodes={nodes} />
      <VariablesSection variables={globalState.variables} />
    </div>
  );
}
