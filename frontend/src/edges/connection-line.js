/**
 * ConnectionLine — the wire drawn while the user is dragging a connection.
 *
 * React Flow's default in-progress line is a straight segment, which then snaps to our
 * curved TypedEdge on drop — an inconsistent preview. This component draws the same
 * bezier curve, in the source handle's data-type colour (read from connectionMode), so
 * the wire looks and reads the same before and after it lands.
 */
import { getBezierPath } from 'reactflow';
import { useStore } from '../store';
import { DATA_TYPE_COLORS, WIRE } from '../styles/design-tokens';

const RAINBOW_ID = 'connection-line-rainbow';

export function ConnectionLine({ fromX, fromY, toX, toY, fromPosition, toPosition }) {
  const sourceDataType = useStore((s) => s.connectionMode?.sourceDataType);
  const raw = DATA_TYPE_COLORS[sourceDataType];
  const isRainbow = raw === 'rainbow';
  const color = isRainbow ? `url(#${RAINBOW_ID})` : raw ?? DATA_TYPE_COLORS.any;
  const dotColor = isRainbow ? '#FF2D78' : color;

  const [path] = getBezierPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    curvature: WIRE.bezierControlPointRatio,
  });

  return (
    <g data-testid="connection-line" data-wire-color={isRainbow ? 'rainbow' : color}>
      {isRainbow && (
        <defs>
          <linearGradient id={RAINBOW_ID} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF2D78" />
            <stop offset="50%" stopColor="#5AC8FA" />
            <stop offset="100%" stopColor="#BF5AF2" />
          </linearGradient>
        </defs>
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={WIRE.hoverThickness}
        strokeOpacity={0.95}
        strokeLinecap="round"
      />
      <circle cx={toX} cy={toY} r={4} fill={dotColor} />
    </g>
  );
}
