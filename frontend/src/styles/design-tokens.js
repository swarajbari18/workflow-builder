/**
 * Design token system — single source of truth for every visual constant.
 *
 * All values come from DESIGN-VISION.md Decision 8. Components import named
 * exports from here; nothing visual is hardcoded in component files.
 *
 * Tokens are plain JS objects (not CSS variables) so they can be used in
 * both CSS-in-JS and inline styles without a build step, and can be consumed
 * by test assertions without a DOM environment.
 */

export const CANVAS = {
  background: '#0D0D0F',
  gridDotColor: 'rgba(255,255,255,0.04)',
  gridInterval: 20,
};

/**
 * Colour for each of the 10 data types.
 * Used on handles, wires, type badges, and inspector panels — everywhere
 * the type of data flowing through a connection is communicated visually.
 * The 'any' value is a sentinel; renderers that need a gradient should
 * check for this string and apply a rainbow gradient instead of a solid fill.
 */
export const DATA_TYPE_COLORS = {
  string:      '#FF2D78',
  number:      '#A5E65A',
  boolean:     '#FF6B35',
  json:        '#FFCC00',
  array:       '#5AC8FA',
  'message[]': '#BF5AF2',
  file:        '#32ADE6',
  'fn-schema': '#5E5CE6',
  trigger:     '#FFFFFF',
  any:         'rainbow',
};

/**
 * Left accent border and category icon colour per node category.
 * Apple semantic system colours — users carry existing colour associations
 * from iOS (green = live, red = pay attention, blue = primary action).
 */
export const CATEGORY_COLORS = {
  triggers:    '#AF52DE',
  ai:          '#007AFF',
  data:        '#FF9500',
  control:     '#FF3B30',
  integration: '#34C759',
  output:      '#8E8E93',
};

// Monochrome category glyphs — rendered in the category colour on node headers and
// in the dock, so a node's category reads at a glance without relying on colour alone.
export const CATEGORY_ICONS = {
  triggers:    '⚡',
  ai:          '✦',
  data:        '▤',
  control:     '⋔',
  integration: '⇄',
  output:      '▣',
};

// Selection ring applied to the node card when it is selected (inspector open).
export const SELECTION_RING = '0 0 0 2px rgba(255,255,255,0.85), 0 4px 20px rgba(0,0,0,0.5)';

/**
 * Ghost glass material for node cards.
 * No backdrop-filter — see DESIGN-VISION.md for the performance rationale.
 * Directional borders simulate a top-left light source; inner glow adds depth.
 */
export const NODE_CARD = {
  background:    'rgba(22, 22, 26, 0.94)',
  borderDefault: 'rgba(255, 255, 255, 0.08)',
  borderTop:     'rgba(255, 255, 255, 0.15)',
  borderLeft:    'rgba(255, 255, 255, 0.12)',
  borderRadius:  16,
  width:         220,
  minHeight:     72,
  shadowOuter:   '0 2px 16px rgba(0, 0, 0, 0.5)',
  shadowRing:    '0 0 0 0.5px rgba(0, 0, 0, 0.6)',
  shadowInner:   'inset 0 1px 0 rgba(255, 255, 255, 0.07)',
};

/**
 * Real Liquid Glass material for static floating panels.
 * backdrop-filter is safe here because these panels are static and appear
 * at most one or two at a time — no per-frame cost concern.
 * Applied to: dock, AI panel, global state panel, command palette, context menus.
 */
export const LIQUID_GLASS = {
  background:      'rgba(22, 22, 26, 0.75)',
  backdropFilter:  'blur(20px) saturate(180%)',
  borderDefault:   'rgba(255, 255, 255, 0.10)',
  borderTop:       'rgba(255, 255, 255, 0.18)',
  borderLeft:      'rgba(255, 255, 255, 0.14)',
  borderRadius:    16,
  shadowOuter:     '0 4px 24px rgba(0, 0, 0, 0.5)',
  shadowInner:     'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
};

/**
 * Handle sizing and opacity values.
 * hitSize > visibleSize: the invisible click target is generous (like a button),
 * the visible shape is small and clean.
 */
export const HANDLE = {
  visibleSize:       13,
  hitSize:           32,
  restOpacity:       0.55,
  activeOpacity:     1.0,
  proximityRadius:   40,
  revealDurationMs:  150,
  hideDurationMs:    200,
};

/**
 * Wire (edge) visual constants.
 * bezierControlPointRatio: control points sit at this fraction of the horizontal
 * distance between source and target — 0.6 gives a gentle S-curve.
 */
export const WIRE = {
  restThickness:          2,
  hoverThickness:         3,
  restOpacity:            0.65,
  activeOpacity:          1.0,
  inactiveBranchOpacity:  0.20,
  bezierControlPointRatio: 0.60,
};

/**
 * Per-state visual constants for the execution status indicator.
 * color: the 8px status dot and border glow base colour.
 * Glow strings are ready-to-use box-shadow values.
 */
export const EXECUTION_STATES = {
  idle: {
    color: '#8E8E93',
    glow:  null,
  },
  queued: {
    color: '#8E8E93',
    glow:  null,
  },
  running: {
    color: '#34C759',
    glow:  '0 0 0 2px #34C759, 0 0 16px rgba(52,199,89,0.35)',
  },
  streaming: {
    color: '#34C759',
    glow:  '0 0 0 2px #34C759, 0 0 24px rgba(52,199,89,0.5)',
  },
  suspended: {
    color: '#FF9500',
    glow:  '0 0 0 2px #FF9500, 0 0 14px rgba(255,149,0,0.3)',
  },
  completed: {
    color: '#34C759',
    glow:  null,
  },
  error: {
    color: '#FF3B30',
    glow:  '0 0 0 2px #FF3B30, 0 0 14px rgba(255,59,48,0.3)',
  },
  stale: {
    color: '#FFD60A',
    glow:  null,
  },
  skipped: {
    color: '#8E8E93',
    glow:  null,
  },
};

/**
 * Connection mode overlay and highlight constants.
 * Active when the user begins dragging from any handle.
 */
export const CONNECTION_MODE = {
  canvasOverlay:        'rgba(0,0,0,0.35)',
  overlayFadeDurationMs: 120,
  compatibleGlow:       '0 0 0 2px rgba(52,199,89,0.5), 0 0 30px rgba(52,199,89,0.15)',
  incompatibleOpacity:  0.18,
  snapBounceDistancePx: 4,
  snapDurationMs:       220,
};

/**
 * Shared animation timing constants.
 * Spring parameters are for use with a spring physics library or CSS transitions
 * that accept duration/easing approximations.
 */
export const ANIMATION = {
  ghostFadeDurationMs:     600,
  dockRevealDurationMs:    200,
  dockHideDelayMs:         1500,
  panelSlideDurationMs:    250,
  completedFlashDurationMs: 400,
  checkmarkDurationMs:     600,
};
