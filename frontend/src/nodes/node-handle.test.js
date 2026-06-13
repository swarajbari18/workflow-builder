/**
 * Tests for NodeHandle — the typed handle component.
 *
 * Shape, color, hit area, and rainbow sentinel behavior are all expressed
 * through data attributes so assertions do not depend on computed CSS or SVG geometry.
 */
import { render } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { NodeHandle } from './node-handle';
import { DATA_TYPE_COLORS } from '../styles/design-tokens';
import { DATA_TYPES } from './nodeSpecs';

const renderHandle = (props) =>
  render(
    <ReactFlowProvider>
      <NodeHandle
        nodeId="test-1"
        handle={{ id: 'out', kind: 'source', side: 'right', dataType: 'string', ...props.handle }}
        revealed={false}
        connected={false}
        {...props}
      />
    </ReactFlowProvider>,
  );

describe('NodeHandle', () => {
  test('renders without crashing for a string source handle', () => {
    const { container } = renderHandle({});
    expect(container.firstChild).toBeInTheDocument();
  });

  test('trigger type renders data-handle-shape=chevron', () => {
    const { container } = renderHandle({
      handle: { id: 'trig', kind: 'target', side: 'left', dataType: 'trigger' },
    });
    expect(container.querySelector('[data-handle-shape="chevron"]')).toBeInTheDocument();
  });

  test('data type renders data-handle-shape=squircle', () => {
    const { container } = renderHandle({
      handle: { id: 'out', kind: 'source', side: 'right', dataType: 'string' },
    });
    expect(container.querySelector('[data-handle-shape="squircle"]')).toBeInTheDocument();
  });

  test('any type renders data-handle-shape=squircle with data-rainbow=true', () => {
    const { container } = renderHandle({
      handle: { id: 'out', kind: 'source', side: 'right', dataType: 'any' },
    });
    const shape = container.querySelector('[data-handle-shape="squircle"]');
    expect(shape).toBeInTheDocument();
    expect(shape.dataset.rainbow).toBe('true');
  });

  test('dynamic type renders data-handle-shape=squircle', () => {
    const { container } = renderHandle({
      handle: { id: 'result', kind: 'source', side: 'right', dataType: 'dynamic' },
    });
    expect(container.querySelector('[data-handle-shape="squircle"]')).toBeInTheDocument();
  });

  test('handle color data attribute matches DATA_TYPE_COLORS for string', () => {
    const { container } = renderHandle({
      handle: { id: 'out', kind: 'source', side: 'right', dataType: 'string' },
    });
    const shape = container.querySelector('[data-handle-color]');
    expect(shape.dataset.handleColor).toBe(DATA_TYPE_COLORS.string);
  });

  test('trigger handle color is white', () => {
    const { container } = renderHandle({
      handle: { id: 'trig', kind: 'target', side: 'left', dataType: 'trigger' },
    });
    const shape = container.querySelector('[data-handle-color]');
    expect(shape.dataset.handleColor).toBe(DATA_TYPE_COLORS.trigger);
  });

  test('renders without crashing for all 10 DATA_TYPES', () => {
    Object.values(DATA_TYPES).forEach((dataType) => {
      const { container } = renderHandle({
        handle: { id: 'h', kind: 'source', side: 'right', dataType },
      });
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  test('renders without crashing for dynamic dataType', () => {
    const { container } = renderHandle({
      handle: { id: 'h', kind: 'source', side: 'right', dataType: 'dynamic' },
    });
    expect(container.firstChild).toBeInTheDocument();
  });

  test('root wrapper has 32px width and height for the hit area', () => {
    const { container } = renderHandle({});
    const wrapper = container.querySelector('[data-handle-wrapper]');
    expect(wrapper.style.width).toBe('32px');
    expect(wrapper.style.height).toBe('32px');
  });
});
