/**
 * NodeHandle — typed visual handle component.
 *
 * Architecture
 * ------------
 * This component renders the VISUAL layer for a handle: a chevron for trigger-type
 * handles and a squircle for all data types. It is purely presentational — no React
 * Flow interaction logic lives here. React Flow's <Handle> (rendered separately in
 * BaseNode) provides the invisible hit area and connection logic; NodeHandle provides
 * the colored shape and shape-encodes direction (chevron) vs data flow (squircle).
 *
 * Data attributes (`data-handle-shape`, `data-handle-color`, `data-rainbow`) make
 * every testable property accessible without relying on computed styles or SVG geometry.
 */
import { DATA_TYPE_COLORS, HANDLE } from '../styles/design-tokens';

const TRIGGER_TYPE = 'trigger';

/**
 * Left-pointing chevron (◁) for trigger target handles.
 * Right-pointing chevron (▷) for trigger source handles.
 * Connected = filled; unconnected = outline only.
 */
function ChevronShape({ direction, color, connected }) {
  const isLeft = direction === 'left';
  const points = isLeft
    ? '14,1 2,6.5 14,12'
    : '6,1 18,6.5 6,12';

  return (
    <svg
      width={20}
      height={13}
      viewBox="0 0 20 13"
      data-handle-shape="chevron"
      data-handle-color={color}
      aria-hidden="true"
    >
      {connected ? (
        <polygon points={points} fill={color} />
      ) : (
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

/**
 * Rounded-square (squircle ◈/◆) for all data-type handles.
 * Connected = filled with type color.
 * Unconnected = outline only.
 * `any` type = rainbow sentinel: `data-rainbow="true"`, gradient applied in CSS/inline.
 */
function SquircleShape({ color, connected, rainbow, dataType }) {
  const stroke = rainbow ? 'url(#squircle-rainbow)' : color;
  const fill = connected ? (rainbow ? 'url(#squircle-rainbow)' : color) : 'none';

  return (
    <svg
      width={HANDLE.visibleSize}
      height={HANDLE.visibleSize}
      viewBox="0 0 13 13"
      data-handle-shape="squircle"
      data-handle-color={rainbow ? DATA_TYPE_COLORS.any : color}
      data-rainbow={rainbow ? 'true' : undefined}
      data-type={dataType}
      aria-hidden="true"
    >
      {rainbow && (
        <defs>
          <linearGradient id="squircle-rainbow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"   stopColor="#FF2D78" />
            <stop offset="25%"  stopColor="#FFCC00" />
            <stop offset="50%"  stopColor="#5AC8FA" />
            <stop offset="75%"  stopColor="#BF5AF2" />
            <stop offset="100%" stopColor="#FF2D78" />
          </linearGradient>
        </defs>
      )}
      <rect
        x={1.5}
        y={1.5}
        width={10}
        height={10}
        rx={3}
        ry={3}
        fill={fill}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </svg>
  );
}

/**
 * Visual handle layer for a single handle spec entry.
 *
 * @param {{
 *   handle: import('./nodeSpecs').Handle,
 *   revealed: boolean,
 *   connected: boolean,
 * }} props
 */
export function NodeHandle({ handle, revealed, connected }) {
  const { side, dataType, offset } = handle;
  const isTrigger = dataType === TRIGGER_TYPE;
  const rawColor = DATA_TYPE_COLORS[dataType];
  const isRainbow = rawColor === 'rainbow';
  const color = isRainbow ? null : (rawColor ?? DATA_TYPE_COLORS.any);

  const wrapperStyle = {
    position: 'absolute',
    width: HANDLE.hitSize,
    height: HANDLE.hitSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: revealed ? HANDLE.activeOpacity : HANDLE.restOpacity,
    pointerEvents: 'none',
    ...(side === 'left'
      ? { left: -(HANDLE.hitSize / 2) }
      : { right: -(HANDLE.hitSize / 2) }),
    ...(offset
      ? { top: offset, transform: undefined }
      : { top: '50%', transform: 'translateY(-50%)' }),
  };

  return (
    <div data-handle-wrapper style={wrapperStyle}>
      {isTrigger ? (
        <ChevronShape direction={side} color={DATA_TYPE_COLORS[TRIGGER_TYPE]} connected={connected} />
      ) : (
        <SquircleShape color={color} connected={connected} rainbow={isRainbow} dataType={dataType} />
      )}
    </div>
  );
}
