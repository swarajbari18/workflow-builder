import { render, screen, fireEvent } from '@testing-library/react';
import { NodeInspectionCard } from './node-inspection-card';
import { useStore } from '../store';

jest.mock('../store', () => ({ useStore: jest.fn() }));

const makeStore = (overrides = {}) => ({
  closeInspectionCard: jest.fn(),
  inspectedNodeId: 'llm-1',
  nodeOutputCache: {},
  nodes: [{ id: 'llm-1', type: 'llm', data: { label: 'My LLM' } }],
  edges: [],
  ...overrides,
});

describe('NodeInspectionCard', () => {
  it('renders the node title', () => {
    useStore.mockImplementation((sel) => sel(makeStore()));
    render(<NodeInspectionCard />);
    expect(screen.getByTestId('node-inspection-card')).toBeInTheDocument();
    expect(screen.getByText('My LLM')).toBeInTheDocument();
  });

  it('returns null when inspectedNodeId matches no node', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      inspectedNodeId: 'ghost-99',
      nodes: [],
    })));
    const { container } = render(<NodeInspectionCard />);
    expect(container.firstChild).toBeNull();
  });

  it('shows "no output" placeholder when cache is empty', () => {
    useStore.mockImplementation((sel) => sel(makeStore()));
    render(<NodeInspectionCard />);
    expect(screen.getByText(/No output captured yet/)).toBeInTheDocument();
  });

  it('shows "Skipped" message for skipped nodes', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodeOutputCache: { 'llm-1': { executionState: 'skipped' } },
    })));
    render(<NodeInspectionCard />);
    expect(screen.getByText(/Skipped — inactive branch/)).toBeInTheDocument();
  });

  it('renders the node output when cached', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodeOutputCache: { 'llm-1': { output: 'Hello from LLM', dataType: 'string' } },
    })));
    render(<NodeInspectionCard />);
    expect(screen.getByText('Hello from LLM')).toBeInTheDocument();
  });

  it('renders timing when duration is available', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodeOutputCache: { 'llm-1': { output: 'x', dataType: 'string', duration: 1.24 } },
    })));
    render(<NodeInspectionCard />);
    expect(screen.getByText('Duration')).toBeInTheDocument();
    expect(screen.getByText('1,240 ms')).toBeInTheDocument();
  });

  it('renders error section when node errored', () => {
    useStore.mockImplementation((sel) => sel(makeStore({
      nodeOutputCache: { 'llm-1': { error: { message: 'API key missing' } } },
    })));
    render(<NodeInspectionCard />);
    expect(screen.getByText('API key missing')).toBeInTheDocument();
  });

  it('calls closeInspectionCard when × is clicked', () => {
    const close = jest.fn();
    useStore.mockImplementation((sel) => sel(makeStore({ closeInspectionCard: close })));
    render(<NodeInspectionCard />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(close).toHaveBeenCalledTimes(1);
  });
});
