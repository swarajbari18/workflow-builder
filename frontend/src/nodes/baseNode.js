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
import { useState, Fragment } from 'react';
import { Handle, Position, useStore as useRFStore } from 'reactflow';
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

const cardStyle = (category) => ({
  position: 'relative',
  width: NODE_CARD.width,
  minHeight: NODE_CARD.minHeight,
  background: NODE_CARD.background,
  border: `1px solid ${NODE_CARD.borderDefault}`,
  borderTop: `1px solid ${NODE_CARD.borderTop}`,
  borderLeft: `4px solid ${CATEGORY_COLORS[category] ?? NODE_CARD.borderLeft}`,
  borderRadius: NODE_CARD.borderRadius,
  boxShadow: [NODE_CARD.shadowOuter, NODE_CARD.shadowRing, NODE_CARD.shadowInner]
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
  display: 'flex',
  justifyContent: 'space-between',
  padding: '2px 12px',
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

  const handles = extraHandles ? [...spec.handles, ...extraHandles] : spec.handles;
  const leftHandles = handles.filter((h) => h.side === 'left');
  const rightHandles = handles.filter((h) => h.side === 'right');
  const rowCount = Math.max(leftHandles.length, rightHandles.length, 1);

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

  const stateStyle = canReceive
    ? { boxShadow: CONNECTION_MODE.compatibleGlow }
    : isIncompatible
      ? { opacity: CONNECTION_MODE.incompatibleOpacity }
      : selected
        ? { boxShadow: SELECTION_RING }
        : null;

  return (
    <div
      style={{ ...cardStyle(spec.category), ...stateStyle, transition: 'opacity 150ms ease, box-shadow 150ms ease' }}
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
          <span>{spec.title}</span>
        </span>
        <div
          data-status-dot
          data-status-color={stateConfig.color}
          style={statusDotStyle(stateConfig.color)}
        />
      </div>

      {/* Handle label rows — each row pairs one left handle with one right handle */}
      <div style={{ padding: '4px 0 8px 0' }}>
        {Array.from({ length: rowCount }, (_, i) => {
          const left = leftHandles[i];
          const right = rightHandles[i];
          const leftLabel = left?.label ?? left?.id;
          const rightLabel = right?.label ?? right?.id;
          return (
            <div key={i} style={handleRowStyle}>
              <span style={handleLabelStyle}>{leftLabel ? `◁ ${leftLabel}` : ''}</span>
              <span style={handleLabelStyle}>{rightLabel ? `${rightLabel} ▷` : ''}</span>
            </div>
          );
        })}
      </div>

      {children}

      {handles.map((handle) => {
        const fullHandleId = `${id}-${handle.id}`;
        const connected = edges.some(
          (e) => e.sourceHandle === fullHandleId || e.targetHandle === fullHandleId,
        );
        return (
          <Fragment key={handle.id}>
            <Handle
              id={fullHandleId}
              type={handle.kind}
              position={handle.side === 'left' ? Position.Left : Position.Right}
              style={{
                width: HANDLE.hitSize,
                height: HANDLE.hitSize,
                background: 'transparent',
                border: 'none',
                ...(handle.offset ? { top: handle.offset } : {}),
              }}
            />
            <NodeHandle
              handle={handle}
              revealed={handlesRevealed}
              connected={connected}
            />
          </Fragment>
        );
      })}
    </div>
  );
};
