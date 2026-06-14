/**
 * Inspector — the floating panel that edits the selected node's fields.
 * Tests drive the real store (zustand): set nodes + inspectorNodeId, render, assert.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { Inspector } from './inspector';
import { useStore } from '../store';

const seedNode = (overrides = {}) => {
  useStore.setState({
    nodes: [
      {
        id: 'llm-1',
        type: 'llm',
        position: { x: 0, y: 0 },
        data: { id: 'llm-1', nodeType: 'llm', model: 'claude-sonnet-4-6', includeHistory: false },
        ...overrides,
      },
    ],
    inspectorNodeId: 'llm-1',
  });
};

afterEach(() => {
  useStore.setState({ nodes: [], inspectorNodeId: null });
});

describe('Inspector', () => {
  test('renders nothing when no node is selected', () => {
    useStore.setState({ nodes: [], inspectorNodeId: null });
    const { container } = render(<Inspector />);
    expect(container.firstChild).toBeNull();
  });

  test('shows the selected node title', () => {
    seedNode();
    render(<Inspector />);
    expect(screen.getByText('LLM')).toBeInTheDocument();
  });

  test('renders the node visible (non-advanced) fields', () => {
    seedNode();
    render(<Inspector />);
    expect(screen.getByLabelText('Model')).toBeInTheDocument();
    expect(screen.getByLabelText('System prompt (inline)')).toBeInTheDocument();
  });

  test('hides advanced fields until the Advanced toggle is opened', () => {
    seedNode();
    render(<Inspector />);
    expect(screen.queryByLabelText('Temperature')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(/advanced/i));
    expect(screen.getByLabelText('Temperature')).toBeInTheDocument();
  });

  test('editing a field writes to the store via updateNodeField', () => {
    seedNode();
    render(<Inspector />);
    fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'gpt-4o' } });
    expect(useStore.getState().nodes[0].data.model).toBe('gpt-4o');
  });

  test('honors showIf — historyLength hidden until includeHistory is on', () => {
    seedNode();
    render(<Inspector />);
    fireEvent.click(screen.getByText(/advanced/i));
    expect(screen.queryByLabelText('History messages')).not.toBeInTheDocument();
    // enable history
    fireEvent.click(screen.getByLabelText('Include conversation history'));
    expect(screen.getByLabelText('History messages')).toBeInTheDocument();
  });

  test('close button clears the inspector', () => {
    seedNode();
    render(<Inspector />);
    fireEvent.click(screen.getByLabelText('Close inspector'));
    expect(useStore.getState().inspectorNodeId).toBeNull();
  });
});
