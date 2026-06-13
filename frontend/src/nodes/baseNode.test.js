/**
 * Tests for the generic node renderer.
 *
 * `isFieldVisible` is tested as a pure function; `BaseNode` is tested through the
 * DOM (title, required marker, conditional `showIf` fields, the advanced toggle).
 * A node renders React Flow handles, which require a ReactFlowProvider ancestor.
 */
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactFlowProvider } from 'reactflow';
import { BaseNode, isFieldVisible } from './baseNode';

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
  const renderNode = (spec, data = {}) =>
    render(
      <ReactFlowProvider>
        <BaseNode id="demo-1" data={data} spec={spec} />
      </ReactFlowProvider>,
    );

  test('renders the node title', () => {
    renderNode({ type: 'demo', title: 'My Node', handles: [], fields: [] });
    expect(screen.getByText('My Node')).toBeInTheDocument();
  });

  test('marks required fields with an asterisk', () => {
    renderNode({
      type: 'demo',
      title: 'Demo',
      handles: [],
      fields: [{ name: 'name', kind: 'text', label: 'Name', required: true }],
    });
    expect(screen.getByText('Name *')).toBeInTheDocument();
  });

  test('hides a showIf field until its condition is met', () => {
    renderNode(
      {
        type: 'demo',
        title: 'Demo',
        handles: [],
        fields: [
          { name: 'mode', kind: 'select', label: 'Mode', options: ['a', 'b'], default: 'a' },
          { name: 'extra', kind: 'text', label: 'Extra', showIf: { mode: 'b' } },
        ],
      },
      { mode: 'a' },
    );
    expect(screen.queryByText('Extra')).not.toBeInTheDocument();
  });

  test('shows a showIf field when its condition is met', () => {
    renderNode(
      {
        type: 'demo',
        title: 'Demo',
        handles: [],
        fields: [
          { name: 'mode', kind: 'select', label: 'Mode', options: ['a', 'b'], default: 'a' },
          { name: 'extra', kind: 'text', label: 'Extra', showIf: { mode: 'b' } },
        ],
      },
      { mode: 'b' },
    );
    expect(screen.getByText('Extra')).toBeInTheDocument();
  });

  test('reveals advanced fields when the Advanced toggle is clicked', async () => {
    renderNode({
      type: 'demo',
      title: 'Demo',
      handles: [],
      fields: [
        { name: 'x', kind: 'text', label: 'Basic' },
        { name: 'y', kind: 'text', label: 'Secret', advanced: true },
      ],
    });
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
    await act(async () => {
      await userEvent.click(screen.getByText(/Advanced/));
    });
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });
});
