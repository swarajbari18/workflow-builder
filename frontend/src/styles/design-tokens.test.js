/**
 * Smoke tests for the design token module.
 *
 * These tests do not check visual correctness — they guard structural
 * contracts that downstream code depends on: the right exports exist,
 * the right keys are present, and no value is accidentally duplicated.
 */
import {
  CANVAS,
  DATA_TYPE_COLORS,
  CATEGORY_COLORS,
  NODE_CARD,
  LIQUID_GLASS,
  HANDLE,
  WIRE,
  EXECUTION_STATES,
  CONNECTION_MODE,
  ANIMATION,
} from './design-tokens';

describe('design-tokens module', () => {
  test('all named exports are present and not undefined', () => {
    expect(CANVAS).toBeDefined();
    expect(DATA_TYPE_COLORS).toBeDefined();
    expect(CATEGORY_COLORS).toBeDefined();
    expect(NODE_CARD).toBeDefined();
    expect(LIQUID_GLASS).toBeDefined();
    expect(HANDLE).toBeDefined();
    expect(WIRE).toBeDefined();
    expect(EXECUTION_STATES).toBeDefined();
    expect(CONNECTION_MODE).toBeDefined();
    expect(ANIMATION).toBeDefined();
  });
});

describe('DATA_TYPE_COLORS', () => {
  const EXPECTED_TYPES = [
    'string', 'number', 'boolean', 'json', 'array',
    'message[]', 'file', 'fn-schema', 'trigger', 'any',
    // `dynamic` is a handle-level type (not a DATA_TYPES enum value) but it
    // does have a color entry so wires/handles are visible before runtime resolves the type.
    'dynamic',
  ];

  test('has exactly the 11 canonical data type colors (10 DATA_TYPES + dynamic)', () => {
    expect(Object.keys(DATA_TYPE_COLORS)).toEqual(expect.arrayContaining(EXPECTED_TYPES));
    expect(Object.keys(DATA_TYPE_COLORS).length).toBe(11);
  });

  test('every colour value is a non-empty string', () => {
    Object.values(DATA_TYPE_COLORS).forEach((colour) => {
      expect(typeof colour).toBe('string');
      expect(colour.length).toBeGreaterThan(0);
    });
  });

  test('every concrete type colour is a valid hex string (any may be different)', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    const concreteTypes = EXPECTED_TYPES.filter((t) => t !== 'any');
    concreteTypes.forEach((type) => {
      expect(DATA_TYPE_COLORS[type]).toMatch(hexPattern);
    });
  });
});

describe('CATEGORY_COLORS', () => {
  const EXPECTED_CATEGORIES = ['triggers', 'ai', 'data', 'control', 'integration', 'output'];

  test('has exactly the 6 node categories', () => {
    expect(Object.keys(CATEGORY_COLORS)).toEqual(expect.arrayContaining(EXPECTED_CATEGORIES));
    expect(Object.keys(CATEGORY_COLORS).length).toBe(6);
  });

  test('every colour is a valid hex string', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    Object.values(CATEGORY_COLORS).forEach((colour) => {
      expect(colour).toMatch(hexPattern);
    });
  });

  test('no two categories share the same colour', () => {
    const colours = Object.values(CATEGORY_COLORS);
    expect(new Set(colours).size).toBe(colours.length);
  });
});

describe('HANDLE', () => {
  test('declares visibleSize and hitSize as positive numbers', () => {
    expect(typeof HANDLE.visibleSize).toBe('number');
    expect(HANDLE.visibleSize).toBeGreaterThan(0);
    expect(typeof HANDLE.hitSize).toBe('number');
    expect(HANDLE.hitSize).toBeGreaterThan(HANDLE.visibleSize);
  });

  test('declares restOpacity and activeOpacity in range [0, 1]', () => {
    expect(HANDLE.restOpacity).toBeGreaterThanOrEqual(0);
    expect(HANDLE.restOpacity).toBeLessThanOrEqual(1);
    expect(HANDLE.activeOpacity).toBeGreaterThanOrEqual(0);
    expect(HANDLE.activeOpacity).toBeLessThanOrEqual(1);
    expect(HANDLE.activeOpacity).toBeGreaterThan(HANDLE.restOpacity);
  });
});

describe('WIRE', () => {
  test('declares restThickness and hoverThickness in pixels', () => {
    expect(typeof WIRE.restThickness).toBe('number');
    expect(WIRE.restThickness).toBeGreaterThan(0);
    expect(typeof WIRE.hoverThickness).toBe('number');
    expect(WIRE.hoverThickness).toBeGreaterThan(WIRE.restThickness);
  });

  test('declares bezierControlPointRatio between 0 and 1', () => {
    expect(WIRE.bezierControlPointRatio).toBeGreaterThan(0);
    expect(WIRE.bezierControlPointRatio).toBeLessThanOrEqual(1);
  });
});

describe('EXECUTION_STATES', () => {
  const EXPECTED_STATES = [
    'idle', 'queued', 'running', 'streaming',
    'suspended', 'completed', 'error', 'stale', 'skipped',
  ];

  test('has all 9 execution states', () => {
    EXPECTED_STATES.forEach((state) => {
      expect(EXECUTION_STATES[state]).toBeDefined();
    });
  });

  test('every state has a color property that is a hex string', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    EXPECTED_STATES.forEach((state) => {
      expect(EXECUTION_STATES[state].color).toMatch(hexPattern);
    });
  });
});
