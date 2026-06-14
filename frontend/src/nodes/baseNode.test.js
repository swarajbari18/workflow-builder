/**
 * Tests for the generic node renderer.
 *
 * `isFieldVisible` is tested as a pure function — it stays exported for the
 * inspector (Phase 4). `BaseNode` is tested for Phase 2 visual behavior:
 * ghost glass material, no fields on node face, execution state dot.
 * A node renders React Flow handles, which require a ReactFlowProvider ancestor.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { ReactFlowProvider } from 'reactflow';
import { BaseNode, isFieldVisible } from './baseNode';
import { useStore } from '../store';
import { CATEGORY_COLORS, EXECUTION_STATES, NODE_CARD } from '../styles/design-tokens';

describe('isFieldVisible', () => {
  const fields = [
    { name: 'mode', kind: 'select', options: ['a', 'b'], default: 'a' },
    { name: 'extra', kind: 'text', showIf: { mode: 'b' } },
    { name: 'op', kind: 'select', options: ['x', 'y', 'z'] },
    { name: 'multi', kind: 'text', showIf: { op: ['x', 'y'] } },
  ];

  test('a field without showIf is always visible', () => {
    expect(isFieldVisible(fields[0], {}, fields)).toBe(true);
  });

  test('matches against the live value', () => {
    expect(isFieldVisible(fields[1], { mode: 'b' }, fields)).toBe(true);
    expect(isFieldVisible(fields[1], { mode: 'a' }, fields)).toBe(false);
  });

  test('falls back to the sibling default when no value is set', () => {
    expect(isFieldVisible(fields[1], {}, fields)).toBe(false);
  });

  test('supports a list of allowed values', () => {
    expect(isFieldVisible(fields[3], { op: 'y' }, fields)).toBe(true);
    expect(isFieldVisible(fields[3], { op: 'z' }, fields)).toBe(false);
  });
});

describe('BaseNode', () => {
  const makeSpec = (overrides = {}) => ({
    type: 'demo',
    title: 'My Node',
    category: 'ai',
    handles: [],
    fields: [
      { name: 'name', kind: 'text', label: 'Name', required: true },
      { name: 'secret', kind: 'text', label: 'Secret', advanced: true },
    ],
    ...overrides,
  });

  const renderNode = (spec, data = {}) =>
    render(
      <ReactFlowProvider>
        <BaseNode id="demo-1" data={data} spec={spec} />
      </ReactFlowProvider>,
    );

  test('renders the node title', () => {
    renderNode(makeSpec());
    expect(screen.getByText('My Node')).toBeInTheDocument();
  });

  test('renders no input, select, or textarea elements on the node face', () => {
    renderNode(makeSpec());
    expect(document.querySelector('input')).toBeNull();
    expect(document.querySelector('select')).toBeNull();
    expect(document.querySelector('textarea')).toBeNull();
  });

  test('applies ghost glass background from NODE_CARD tokens', () => {
    const { container } = renderNode(makeSpec());
    const card = container.firstChild;
    expect(card.style.background).toBe(NODE_CARD.background);
  });

  test('left border accent uses category color for ai category', () => {
    const { container } = renderNode(makeSpec({ category: 'ai' }));
    const card = container.firstChild;
    expect(card.style.borderLeft).toContain(CATEGORY_COLORS.ai);
  });

  test('left border accent uses category color for triggers category', () => {
    const { container } = renderNode(makeSpec({ category: 'triggers' }));
    const card = container.firstChild;
    expect(card.style.borderLeft).toContain(CATEGORY_COLORS.triggers);
  });

  test('root element has data-execution-state set to idle by default', () => {
    const { container } = renderNode(makeSpec());
    expect(container.firstChild.dataset.executionState).toBe('idle');
  });

  test('root element reflects data.executionState when provided', () => {
    const { container } = renderNode(makeSpec(), { executionState: 'running' });
    expect(container.firstChild.dataset.executionState).toBe('running');
  });

  test('status dot is present in the header', () => {
    const { container } = renderNode(makeSpec());
    expect(container.querySelector('[data-status-dot]')).toBeInTheDocument();
  });

  test('status dot color matches EXECUTION_STATES idle color by default', () => {
    const { container } = renderNode(makeSpec());
    const dot = container.querySelector('[data-status-dot]');
    expect(dot.dataset.statusColor).toBe(EXECUTION_STATES.idle.color);
  });

  test('status dot color reflects running state', () => {
    const { container } = renderNode(makeSpec(), { executionState: 'running' });
    const dot = container.querySelector('[data-status-dot]');
    expect(dot.dataset.statusColor).toBe(EXECUTION_STATES.running.color);
  });

  describe('connection mode highlighting', () => {
    const targetSpec = makeSpec({
      handles: [{ id: 'in', kind: 'target', side: 'left', dataType: 'string' }],
    });
    afterEach(() => useStore.setState({ connectionMode: null }));

    test('marks a node with a compatible target handle as compatible', () => {
      useStore.setState({ connectionMode: { sourceNodeId: 'other', sourceDataType: 'string' } });
      const { container } = renderNode(targetSpec);
      expect(container.firstChild.dataset.connectionTarget).toBe('compatible');
    });

    test('marks a node with no compatible target handle as incompatible', () => {
      useStore.setState({ connectionMode: { sourceNodeId: 'other', sourceDataType: 'number' } });
      const { container } = renderNode(targetSpec);
      expect(container.firstChild.dataset.connectionTarget).toBe('incompatible');
    });

    test('does not dim the node the drag started from', () => {
      useStore.setState({ connectionMode: { sourceNodeId: 'demo-1', sourceDataType: 'number' } });
      const { container } = renderNode(targetSpec);
      expect(container.firstChild.dataset.connectionTarget).toBeUndefined();
    });
  });

  test('handles reveal on mouse enter and hide on mouse leave', () => {
    const spec = makeSpec({
      handles: [{ id: 'out', kind: 'source', side: 'right', dataType: 'string' }],
    });
    const { container } = renderNode(spec);
    const card = container.firstChild;
    fireEvent.mouseEnter(card);
    expect(card.dataset.handlesRevealed).toBe('true');
    fireEvent.mouseLeave(card);
    expect(card.dataset.handlesRevealed).toBe('false');
  });
});
