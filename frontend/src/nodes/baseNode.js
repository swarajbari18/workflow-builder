/**
 * BaseNode — the one component that renders every node type from its NodeSpec.
 *
 * Architecture
 * ------------
 * Phase 2 visual layer: ghost glass material, category accent border, status dot,
 * handle shapes by data type. Fields are NOT rendered on the node face — they live
 * in the inspector (Phase 4). isFieldVisible stays exported for inspector use.
 *
 * Handle proximity reveal: onMouseEnter/Leave on the card drives `handlesRevealed`
 * state, which is forwarded to each NodeHandle as an opacity signal.
 */
import { useState, useEffect, Fragment } from 'react';
import { Handle, Position, useStore as useRFStore, useUpdateNodeInternals } from 'reactflow';
import { NODE_CARD, CATEGORY_COLORS, CATEGORY_ICONS, EXECUTION_STATES, HANDLE, CONNECTION_MODE, SELECTION_RING } from '../styles/design-tokens';
import { NodeHandle } from './node-handle';
import { useStore } from '../store';
import { isCompatibleTypes } from './nodeSpecs';

/**
 * Whether a field should be shown given the current values. A field with a
 * `showIf` constraint is visible only when every named sibling matches an allowed
 * value; siblings fall back to their declared default so conditional fields
 * resolve correctly before the user has touched anything.
 *
 * @param {import('./nodeSpecs').Field} field
 * @param {Object} data
 * @param {import('./nodeSpecs').Field[]} fields  Sibling fields (used for defaults).
 * @returns {boolean}
 */
export function isFieldVisible(field, data, fields) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([siblingName, allowed]) => {
    const sibling = fields.find((candidate) => candidate.name === siblingName);
    const current = data[siblingName] ?? sibling?.default;
    return Array.isArray(allowed) ? allowed.includes(current) : current === allowed;
  });
}

/**
 * Returns true when a handle should be omitted from the rendered node.
 *
 * Currently supports one condition: `hiddenWhen.handleConnected` — the handle
 * disappears while the named sibling handle on the same node has at least one
 * live edge. This drives the Script node's transform ↔ tool mode switch:
 *
 *   input wired   → fn-schema is hidden  (transform mode)
 *   input absent  → fn-schema is visible  (tool mode)
 *
 * Exported so the inspector can call the same predicate without duplicating logic.
 *
 * @param {import('./nodeSpecs').Handle} handle  The handle to evaluate.
 * @param {string} nodeId                         The containing node's React Flow id.
 * @param {Array<{sourceHandle: string, targetHandle: string}>} edges  Current edge list.
 * @returns {boolean}
 */
export function isHandleHidden(handle, nodeId, edges) {
  const condition = handle.hiddenWhen;
  if (!condition) return false;
  if (condition.handleConnected) {
    const siblingHandleId = `${nodeId}-${condition.handleConnected}`;
    return edges.some(
      (e) => e.sourceHandle === siblingHandleId || e.targetHandle === siblingHandleId,
    );
  }
  return false;
}

const cardStyle = (category, glow) => ({
  position: 'relative',
  width: NODE_CARD.width,
  minHeight: NODE_CARD.minHeight,
  background: NODE_CARD.background,
  border: `1px solid ${NODE_CARD.borderDefault}`,
  borderTop: `1px solid ${NODE_CARD.borderTop}`,
  borderLeft: `4px solid ${CATEGORY_COLORS[category] ?? NODE_CARD.borderLeft}`,
  borderRadius: NODE_CARD.borderRadius,
  boxShadow: [
    glow,
    NODE_CARD.shadowOuter,
    NODE_CARD.shadowRing,
    NODE_CARD.shadowInner,
  ]
    .filter(Boolean)
    .join(', '),
  fontFamily: 'Inter, sans-serif',
  fontSize: 12,
  color: 'rgba(255,255,255,0.9)',
  willChange: 'transform',
});

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 10px 8px 8px',
  fontWeight: 600,
  fontSize: 14,
};

const statusDotStyle = (color) => ({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: color,
  flexShrink: 0,
});

/**
 * Renders a node from its spec. `id` and `data` are injected by React Flow;
 * `spec` is bound per type in `nodeRegistry.js`. Node types that need more than the
 * generic card pass `extraHandles` (e.g. Text's dynamic `{{variable}}` handles) and/or
 * `children` (an inline body, e.g. the Output node's result display).
 *
 * @param {{
 *   id: string,
 *   data: Object,
 *   spec: import('./nodeSpecs').NodeSpec,
 *   extraHandles?: import('./nodeSpecs').Handle[],
 *   children?: React.ReactNode,
 * }} props
 */
const handleRowStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: 24,
  padding: '3px 14px',
};

const handleLabelStyle = {
  color: 'rgba(255,255,255,0.62)',
  fontSize: 11,
  letterSpacing: '0.01em',
  fontFamily: 'Inter, sans-serif',
};

const categoryIconStyle = (category) => ({
  fontSize: 14,
  lineHeight: 1,
  color: CATEGORY_COLORS[category] ?? 'rgba(255,255,255,0.6)',
  marginRight: 7,
});

export const BaseNode = ({ id, data, spec, extraHandles, children, selected }) => {
  const [handlesRevealed, setHandlesRevealed] = useState(false);
  const executionState = data.executionState ?? 'idle';
  const stateConfig = EXECUTION_STATES[executionState] ?? EXECUTION_STATES.idle;
  const edges = useRFStore((state) => state.edges);

  // DAG role highlighting — populated after user hits Submit, cleared after 5s.
  const nodeRoles = useStore((s) => s.nodeRoles);
  const nodeRole = nodeRoles[id];  // 'outer' | 'subgraph' | 'tool' | 'cycle' | 'cycle-terminus' | undefined
  // Execution order index for outer nodes: position in topo_order array.
  // We reconstruct order from the keys whose role is 'outer' — the order the
  // store populated them in is the topo_order sequence.
  const topoIndex = nodeRole === 'outer'
    ? Object.keys(nodeRoles).filter((k) => nodeRoles[k] === 'outer').indexOf(id)
    : -1;

  const roleClass = nodeRole === 'outer'          ? 'node-role-outer'
                  : nodeRole === 'subgraph'        ? 'node-role-subgraph'
                  : nodeRole === 'tool'            ? 'node-role-tool'
                  : nodeRole === 'cycle'           ? 'node-role-cycle'
                  : nodeRole === 'cycle-terminus'  ? 'node-role-cycle-terminus'
                  : '';

  const handles = extraHandles ? [...spec.handles, ...extraHandles] : spec.handles;
  const visibleHandles = handles.filter((h) => !isHandleHidden(h, id, edges));
  const leftHandles = visibleHandles.filter((h) => h.side === 'left');
  const rightHandles = visibleHandles.filter((h) => h.side === 'right');
  const rowCount = Math.max(leftHandles.length, rightHandles.length, 1);

  // Each handle (connection point, visual, and label) lives in one row so they stay
  // aligned; when the handle set changes (e.g. Text gains a {{variable}}) React Flow must
  // re-measure their positions or edge endpoints drift.
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    updateNodeInternals(id);
  }, [id, handles.length, updateNodeInternals]);

  const renderHandle = (handle) => {
    if (!handle) return null;
    const fullHandleId = `${id}-${handle.id}`;
    const connected = edges.some(
      (e) => e.sourceHandle === fullHandleId || e.targetHandle === fullHandleId,
    );
    const edgePosition =
      handle.side === 'left'
        ? { left: 0, transform: 'translate(-50%, -50%)' }
        : { right: 0, transform: 'translate(50%, -50%)' };
    return (
      <Fragment>
        <Handle
          id={fullHandleId}
          type={handle.kind}
          position={handle.side === 'left' ? Position.Left : Position.Right}
          style={{
            width: HANDLE.hitSize,
            height: HANDLE.hitSize,
            background: 'transparent',
            border: 'none',
            top: '50%',
            ...edgePosition,
          }}
        />
        <NodeHandle
          handle={{ ...handle, offset: undefined }}
          revealed={handlesRevealed}
          connected={connected}
        />
      </Fragment>
    );
  };

  // While a wire is being dragged, light up nodes that can receive it and dim the rest,
  // so the user can see where a connection is allowed without trial and error.
  const connectionMode = useStore((s) => s.connectionMode);
  const isDragSource = connectionMode?.sourceNodeId === id;
  const canReceive =
    !!connectionMode &&
    !isDragSource &&
    handles.some(
      (h) => h.kind === 'target' && isCompatibleTypes(connectionMode.sourceDataType, h.dataType),
    );
  const isIncompatible = !!connectionMode && !isDragSource && !canReceive;

  const executionGlow = stateConfig.glow;

  const stateStyle = canReceive
    ? { boxShadow: CONNECTION_MODE.compatibleGlow }
    : isIncompatible
      ? { opacity: CONNECTION_MODE.incompatibleOpacity }
      : selected
        ? { boxShadow: SELECTION_RING }
        : executionGlow
          ? { boxShadow: executionGlow }
          : null;

  const skippedOpacity = executionState === 'skipped' ? { opacity: 0.35 } : null;

  return (
    <div
      className={roleClass}
      style={{
        ...cardStyle(spec.category, !canReceive && !isIncompatible && !selected ? executionGlow : null),
        ...stateStyle,
        ...skippedOpacity,
        transition: 'opacity 150ms ease, box-shadow 200ms ease',
      }}
      data-execution-state={executionState}
      data-handles-revealed={String(handlesRevealed)}
      data-connection-target={canReceive ? 'compatible' : isIncompatible ? 'incompatible' : undefined}
      onMouseEnter={() => setHandlesRevealed(true)}
      onMouseLeave={() => setHandlesRevealed(false)}
    >
      <div style={headerStyle}>
        <span style={{ display: 'flex', alignItems: 'center' }}>
          <span style={categoryIconStyle(spec.category)} aria-hidden="true">
            {CATEGORY_ICONS[spec.category]}
          </span>
          <span>{data.label || spec.title}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {nodeRole === 'outer' && topoIndex >= 0 && (
            <span
              data-role-badge="outer"
              style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                color: 'rgba(52,199,89,0.9)',
                background: 'rgba(52,199,89,0.12)',
                border: '1px solid rgba(52,199,89,0.3)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}
            >
              {topoIndex + 1}
            </span>
          )}
          {nodeRole === 'subgraph' && (
            <span
              data-role-badge="subgraph"
              style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                color: 'rgba(191,90,242,0.9)',
                background: 'rgba(191,90,242,0.12)',
                border: '1px solid rgba(191,90,242,0.3)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}
            >
              ⟲ loop
            </span>
          )}
          {nodeRole === 'tool' && (
            <span
              data-role-badge="tool"
              style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                color: 'rgba(255,149,0,0.9)',
                background: 'rgba(255,149,0,0.12)',
                border: '1px solid rgba(255,149,0,0.3)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}
            >
              ⚙ tool
            </span>
          )}
          {nodeRole === 'cycle-terminus' && (
            <span
              data-role-badge="cycle-terminus"
              style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'Inter, sans-serif',
                color: 'rgba(255,59,48,0.95)',
                background: 'rgba(255,59,48,0.15)',
                border: '1px solid rgba(255,59,48,0.4)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}
            >
              ✕ cycle
            </span>
          )}
          {nodeRole === 'cycle' && (
            <span
              data-role-badge="cycle"
              style={{
                fontSize: 10, fontWeight: 600, fontFamily: 'Inter, sans-serif',
                color: 'rgba(255,59,48,0.8)',
                background: 'rgba(255,59,48,0.10)',
                border: '1px solid rgba(255,59,48,0.25)',
                borderRadius: 999, padding: '0 5px', lineHeight: '16px',
              }}
            >
              cycle
            </span>
          )}
          {executionState === 'stale' && (
            <span
              data-stale-badge
              style={{
                fontSize: 10, lineHeight: 1, color: '#FFD60A',
                marginRight: 3, opacity: 0.85,
              }}
              title="Config changed — needs re-run"
            >
              ↻
            </span>
          )}
          <div
            data-status-dot
            data-status-color={stateConfig.color}
            style={statusDotStyle(stateConfig.color)}
          />
        </span>
      </div>

      {/* One row per handle pair — connection point, visual, and label share a row so
          a label always sits beside its own handle. */}
      <div style={{ padding: '2px 0 8px 0' }}>
        {Array.from({ length: rowCount }, (_, i) => {
          const left = leftHandles[i];
          const right = rightHandles[i];
          const leftLabel = left?.label ?? left?.id;
          const rightLabel = right?.label ?? right?.id;
          return (
            <div key={i} style={handleRowStyle}>
              <span style={handleLabelStyle}>{leftLabel ? `◁ ${leftLabel}` : ''}</span>
              <span style={handleLabelStyle}>{rightLabel ? `${rightLabel} ▷` : ''}</span>
              {renderHandle(left)}
              {renderHandle(right)}
            </div>
          );
        })}
      </div>

      {children}
    </div>
  );
};
