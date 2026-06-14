import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalStatePanel } from './global-state-panel';
import { useStore } from '../store';

jest.mock('../store', () => ({
  useStore: jest.fn(),
}));

const makeStore = (overrides = {}) => ({
  closeStatePanel: jest.fn(),
  globalState: { messages: [], variables: {} },
  nodeOutputCache: {},
  nodes: [],
  ...overrides,
});

describe('GlobalStatePanel', () => {
  it('renders the panel with three section headers', () => {
    useStore.mockImplementation((sel) => sel(makeStore()));
    render(<GlobalStatePanel />);
    expect(screen.getByTestId('global-state-panel')).toBeInTheDocument();
    expect(screen.getByText('Conversation')).toBeInTheDocument();
    expect(screen.getByText('Node Outputs')).toBeInTheDocument();
    expect(screen.getByText('Variables')).toBeInTheDocument();
  });

  it('shows empty message when no conversation history', () => {
    useStore.mockImplementation((sel) => sel(makeStore()));
    render(<GlobalStatePanel />);
    expect(screen.getByText('No messages yet.')).toBeInTheDocument();
  });

  it('renders conversation messages', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      globalState: {
        messages: [
          { role: 'user', content: 'Hello AI' },
          { role: 'assistant', content: 'Hello human' },
        ],
        variables: {},
      },
    })));
    render(<GlobalStatePanel />);
    expect(screen.getByText('Hello AI')).toBeInTheDocument();
    expect(screen.getByText('Hello human')).toBeInTheDocument();
  });

  it('shows empty message when no node outputs', () => {
    useStore.mockImplementation((sel) => sel(makeStore()));
    render(<GlobalStatePanel />);
    expect(screen.getByText(/No outputs yet/)).toBeInTheDocument();
  });

  it('renders a node output row for each cached node with output', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodes: [{ id: 'llm-1', type: 'llm', data: { label: 'My LLM' } }],
      nodeOutputCache: {
        'llm-1': { output: 'Hello!', dataType: 'string' },
        'empty-1': { startedAt: 'ts' }, // no output — should not appear
      },
    })));
    render(<GlobalStatePanel />);
    expect(screen.getByTestId('state-node-row-llm-1')).toBeInTheDocument();
    expect(screen.queryByTestId('state-node-row-empty-1')).not.toBeInTheDocument();
  });

  it('expands node output on click', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodes: [{ id: 'n1', type: 'text', data: {} }],
      nodeOutputCache: { 'n1': { output: 'expanded text', dataType: 'string' } },
    })));
    render(<GlobalStatePanel />);
    fireEvent.click(screen.getByTestId('state-node-row-n1'));
    expect(screen.getByText('expanded text')).toBeInTheDocument();
  });

  it('calls closeStatePanel when × is clicked', () => {
    const close = jest.fn();
    useStore.mockImplementation((sel) => sel(makeStore({ closeStatePanel: close })));
    render(<GlobalStatePanel />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('shows variables when section is expanded', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      globalState: { messages: [], variables: { counter: 3, score: 0.84 } },
    })));
    render(<GlobalStatePanel />);
    // Variables section is collapsed by default — click to open
    fireEvent.click(screen.getByText('Variables'));
    expect(screen.getByText('counter')).toBeInTheDocument();
    expect(screen.getByText('score')).toBeInTheDocument();
  });
});
