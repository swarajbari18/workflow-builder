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

/**
 * Custom edge that inherits the source handle's data type color.
 *
 * @param {import('reactflow').EdgeProps & { data: { dataType?: string } }} props
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
  const dataType = data?.dataType ?? 'any';
  const rawColor = DATA_TYPE_COLORS[dataType];
  const isRainbow = rawColor === 'rainbow';
  const color = isRainbow ? null : (rawColor ?? DATA_TYPE_COLORS.any);

  const gradientId = `wire-rainbow-${id}`;
  const badgeColor = isRainbow ? '#FFFFFF' : color;
  const badgeLabel = TYPE_LABELS[dataType] ?? dataType;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: WIRE.bezierControlPointRatio,
  });

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
