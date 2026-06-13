/**
 * Tests for TypedEdge — the custom wire component.
 *
 * Wire color, opacity, and rainbow sentinel are expressed through data attributes
 * so assertions do not depend on SVG geometry or computed styles.
 */
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { TypedEdge } from './typed-edge';
import { DATA_TYPE_COLORS, WIRE } from '../styles/design-tokens';

const baseProps = {
  id: 'edge-1',
  source: 'n1',
  target: 'n2',
  sourceX: 0,
  sourceY: 0,
  targetX: 200,
  targetY: 0,
  sourcePosition: 'right',
  targetPosition: 'left',
  data: { dataType: 'string' },
};

const renderEdge = (overrides = {}) =>
  render(
    <ReactFlowProvider>
      <svg>
        <TypedEdge {...baseProps} {...overrides} />
      </svg>
    </ReactFlowProvider>,
  );

describe('TypedEdge', () => {
  test('renders without crashing for string type', () => {
    const { container } = renderEdge();
    expect(container.querySelector('path')).toBeInTheDocument();
  });

  test('path data-wire-color matches DATA_TYPE_COLORS for string', () => {
    const { container } = renderEdge({ data: { dataType: 'string' } });
    const path = container.querySelector('[data-wire-color]');
    expect(path.dataset.wireColor).toBe(DATA_TYPE_COLORS.string);
  });

  test('path data-wire-color matches DATA_TYPE_COLORS for json', () => {
    const { container } = renderEdge({ data: { dataType: 'json' } });
    const path = container.querySelector('[data-wire-color]');
    expect(path.dataset.wireColor).toBe(DATA_TYPE_COLORS.json);
  });

  test('path data-wire-color is rainbow for any type', () => {
    const { container } = renderEdge({ data: { dataType: 'any' } });
    const path = container.querySelector('[data-wire-color]');
    expect(path.dataset.wireColor).toBe('rainbow');
  });

  test('path stroke-opacity matches WIRE.restOpacity', () => {
    const { container } = renderEdge();
    const path = container.querySelector('[data-wire-color]');
    expect(path.getAttribute('stroke-opacity')).toBe(String(WIRE.restOpacity));
  });

  test('path stroke-width matches WIRE.restThickness', () => {
    const { container } = renderEdge();
    const path = container.querySelector('[data-wire-color]');
    expect(path.getAttribute('stroke-width')).toBe(String(WIRE.restThickness));
  });

  test('renders without crashing when data is missing (defaults to any)', () => {
    const { container } = renderEdge({ data: undefined });
    expect(container.querySelector('path')).toBeInTheDocument();
  });

  test('renders without crashing for all declared data types', () => {
    const types = ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger', 'any', 'dynamic'];
    types.forEach((dataType) => {
      const { container } = renderEdge({ data: { dataType } });
      expect(container.querySelector('path')).toBeInTheDocument();
    });
  });
});
