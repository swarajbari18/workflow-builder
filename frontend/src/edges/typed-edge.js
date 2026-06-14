/**
 * TypedEdge — custom wire component for React Flow.
 *
 * Architecture
 * ------------
 * Every edge inherits the source handle's data type color, set on the edge's
 * `data.dataType` field when the connection is created in store.js. This keeps
 * the edge self-contained — no need to query node specs at render time.
 *
 * The bezier curve uses `curvature: WIRE.bezierControlPointRatio` (0.60), which
 * places control points at 60% of the horizontal distance — a gentle S-curve that
 * reads as a physical cable rather than a straight line or 90-degree elbow.
 *
 * The `any` type color is the sentinel string 'rainbow'. TypedEdge renders a
 * per-edge linearGradient (id scoped to the edge id) to avoid SVG gradient
 * id collisions when multiple `any`-type wires exist simultaneously.
 *
 * `data-wire-color` on the <path> exposes the color for tests without relying
 * on computed SVG fill/stroke values.
 *
 * Back-edge rendering: when `data.isBackEdge` is true (stamped by store.js after
 * a failed DAG parse), the wire renders in red with an animated marching-ant dash —
 * the visual "closing edge" that shows the user exactly which wire creates the cycle.
 */
import { getBezierPath, EdgeLabelRenderer } from 'reactflow';
import { DATA_TYPE_COLORS, WIRE } from '../styles/design-tokens';

// What the type badge says — friendlier than the raw type id where it helps.
const TYPE_LABELS = {
  'message[]': 'messages',
  'fn-schema': 'tool',
  dynamic: 'auto',
};

const RAINBOW_COLORS = [
  { offset: '0%',   color: '#FF2D78' },
  { offset: '20%',  color: '#FFCC00' },
  { offset: '40%',  color: '#A5E65A' },
  { offset: '60%',  color: '#5AC8FA' },
  { offset: '80%',  color: '#BF5AF2' },
  { offset: '100%', color: '#FF2D78' },
];

const BACK_EDGE_COLOR = '#FF3B30';

/**
 * Custom edge that inherits the source handle's data type color.
 * When data.isBackEdge is true, renders as an animated red marching-ant wire.
 *
 * @param {import('reactflow').EdgeProps & { data: { dataType?: string, isBackEdge?: boolean } }} props
 */
export function TypedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}) {
  const isBackEdge = data?.isBackEdge === true;
  const dataType = data?.dataType ?? 'any';
  const rawColor = DATA_TYPE_COLORS[dataType];
  const isRainbow = rawColor === 'rainbow';
  const color = isRainbow ? null : (rawColor ?? DATA_TYPE_COLORS.any);

  const gradientId = `wire-rainbow-${id}`;
  const badgeColor = isBackEdge ? BACK_EDGE_COLOR : (isRainbow ? '#FFFFFF' : color);
  const badgeLabel = isBackEdge ? '✕ cycle' : (TYPE_LABELS[dataType] ?? dataType);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: WIRE.bezierControlPointRatio,
  });

  if (isBackEdge) {
    return (
      <g>
        {/* Wide translucent glow behind the dashed stroke */}
        <path
          d={edgePath}
          stroke={BACK_EDGE_COLOR}
          strokeWidth={6}
          strokeOpacity={0.18}
          fill="none"
        />
        <path
          id={id}
          d={edgePath}
          stroke={BACK_EDGE_COLOR}
          strokeWidth={WIRE.hoverThickness}
          strokeOpacity={0.9}
          strokeDasharray="6 4"
          fill="none"
          data-wire-color={BACK_EDGE_COLOR}
          style={{ animation: 'back-edge-march 0.7s linear infinite' }}
        />
        <style>{`
          @keyframes back-edge-march {
            from { stroke-dashoffset: 0; }
            to   { stroke-dashoffset: -20; }
          }
        `}</style>
        <EdgeLabelRenderer>
          <div
            data-edge-badge={badgeLabel}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'none',
              padding: '1px 7px',
              borderRadius: 999,
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '0.02em',
              color: BACK_EDGE_COLOR,
              background: 'rgba(13,13,15,0.92)',
              border: `1px solid ${BACK_EDGE_COLOR}88`,
              whiteSpace: 'nowrap',
            }}
          >
            {badgeLabel}
          </div>
        </EdgeLabelRenderer>
      </g>
    );
  }

  return (
    <g>
      {isRainbow && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {RAINBOW_COLORS.map(({ offset, color: stopColor }) => (
              <stop key={offset} offset={offset} stopColor={stopColor} />
            ))}
          </linearGradient>
        </defs>
      )}
      <path
        id={id}
        d={edgePath}
        stroke={isRainbow ? `url(#${gradientId})` : color}
        strokeWidth={WIRE.restThickness}
        strokeOpacity={WIRE.restOpacity}
        fill="none"
        data-wire-color={isRainbow ? 'rainbow' : color}
      />
      <EdgeLabelRenderer>
        <div
          data-edge-badge={badgeLabel}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'none',
            padding: '1px 7px',
            borderRadius: 999,
            fontSize: 10,
            fontWeight: 600,
            fontFamily: 'Inter, sans-serif',
            letterSpacing: '0.02em',
            color: badgeColor,
            background: 'rgba(13,13,15,0.85)',
            border: `1px solid ${badgeColor}55`,
            whiteSpace: 'nowrap',
          }}
        >
          {badgeLabel}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
