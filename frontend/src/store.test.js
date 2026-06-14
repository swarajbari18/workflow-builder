/**
 * Unit tests for the pipeline store: node creation, id generation, immutable
 * field update, connection mode, command palette, context menu state, and the
 * DAG status state machine.
 */
import { useStore } from './store';

beforeEach(() => {
  useStore.setState({
    nodes: [],
    edges: [],
    nodeIDs: {},
    connectionMode: null,
    paletteOpen: false,
    paletteFilter: null,
    paletteDropPos: null,
    contextMenu: null,
    dagStatus: 'pristine',
    nodeRoles: {},
  });
});

test('addNode appends a node', () => {
  useStore.getState().addNode({ id: 'a-1', type: 'a', position: { x: 0, y: 0 }, data: {} });
  expect(useStore.getState().nodes).toHaveLength(1);
});

test('getNodeID increments per type', () => {
  const { getNodeID } = useStore.getState();
  expect(getNodeID('llm')).toBe('llm-1');
  expect(getNodeID('llm')).toBe('llm-2');
  expect(getNodeID('text')).toBe('text-1');
});

test('updateNodeField updates the target node immutably', () => {
  const node = {
    id: 'customInput-1',
    type: 'customInput',
    position: { x: 0, y: 0 },
    data: { inputName: 'old' },
  };
  useStore.setState({ nodes: [node] });

  useStore.getState().updateNodeField('customInput-1', 'inputName', 'new');

  const updated = useStore.getState().nodes[0];
  expect(updated.data.inputName).toBe('new');
  expect(updated).not.toBe(node); // a new object, not an in-place mutation
});

describe('connection mode', () => {
  test('startConnection sets connectionMode with source details', () => {
    useStore.getState().startConnection('llm-1', 'llm-1-response', 'string');
    const { connectionMode } = useStore.getState();
    expect(connectionMode).toEqual({
      sourceNodeId: 'llm-1',
      sourceHandleId: 'llm-1-response',
      sourceDataType: 'string',
    });
  });

  test('endConnection clears connectionMode', () => {
    useStore.getState().startConnection('llm-1', 'llm-1-response', 'string');
    useStore.getState().endConnection();
    expect(useStore.getState().connectionMode).toBeNull();
  });
});

describe('command palette', () => {
  test('openPalette sets paletteOpen with optional filter and position', () => {
    useStore.getState().openPalette({ sourceDataType: 'string' }, { x: 100, y: 200 });
    const state = useStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteFilter).toEqual({ sourceDataType: 'string' });
    expect(state.paletteDropPos).toEqual({ x: 100, y: 200 });
  });

  test('openPalette with no args opens palette unfiltered', () => {
    useStore.getState().openPalette();
    const state = useStore.getState();
    expect(state.paletteOpen).toBe(true);
    expect(state.paletteFilter).toBeNull();
    expect(state.paletteDropPos).toBeNull();
  });

  test('closePalette resets all palette state', () => {
    useStore.getState().openPalette({ sourceDataType: 'json' }, { x: 50, y: 50 });
    useStore.getState().closePalette();
    const state = useStore.getState();
    expect(state.paletteOpen).toBe(false);
    expect(state.paletteFilter).toBeNull();
    expect(state.paletteDropPos).toBeNull();
  });
});

describe('context menu', () => {
  test('openContextMenu sets contextMenu with type, position, and target', () => {
    useStore.getState().openContextMenu('node', 150, 300, { id: 'llm-1' });
    const { contextMenu } = useStore.getState();
    expect(contextMenu).toEqual({ type: 'node', x: 150, y: 300, target: { id: 'llm-1' } });
  });

  test('closeContextMenu clears contextMenu', () => {
    useStore.getState().openContextMenu('pane', 0, 0, null);
    useStore.getState().closeContextMenu();
    expect(useStore.getState().contextMenu).toBeNull();
  });
});

describe('DAG status state machine', () => {
  test('initial dagStatus is pristine', () => {
    expect(useStore.getState().dagStatus).toBe('pristine');
  });

  test('onNodesChange resets dagStatus from valid to pristine on structural change', () => {
    useStore.setState({ dagStatus: 'valid' });
    // 'remove' is structural — it changes topology, so dagStatus must reset.
    useStore.getState().onNodesChange([{ type: 'remove', id: 'n-1' }]);
    expect(useStore.getState().dagStatus).toBe('pristine');
  });

  test('onNodesChange does NOT reset dagStatus on position-only change', () => {
    useStore.setState({ dagStatus: 'valid' });
    // 'position' is non-structural — moving a node does not affect DAG validity.
    useStore.getState().onNodesChange([{ type: 'position', id: 'n-1', position: { x: 1, y: 1 } }]);
    expect(useStore.getState().dagStatus).toBe('valid');
  });

  test('onEdgesChange resets dagStatus from valid to pristine', () => {
    useStore.setState({ dagStatus: 'valid' });
    useStore.getState().onEdgesChange([{ type: 'remove', id: 'e-1' }]);
    expect(useStore.getState().dagStatus).toBe('pristine');
  });

  test('onEdgesChange resets dagStatus from invalid to pristine', () => {
    useStore.setState({ dagStatus: 'invalid' });
    useStore.getState().onEdgesChange([{ type: 'remove', id: 'e-1' }]);
    expect(useStore.getState().dagStatus).toBe('pristine');
  });

  test('updateNodeField does NOT reset dagStatus — field values are not topology', () => {
    const node = { id: 'llm-1', type: 'llm', position: { x: 0, y: 0 }, data: { model: 'old' } };
    useStore.setState({ nodes: [node], dagStatus: 'valid' });
    useStore.getState().updateNodeField('llm-1', 'model', 'new');
    expect(useStore.getState().dagStatus).toBe('valid');
  });

  test('submitPipeline sets dagStatus to pending then resolves to valid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        num_nodes: 2, num_edges: 1, is_dag: true,
        topo_order: ['n-1', 'n-2'],
        subgraph_members: [], tool_nodes: [],
        cycle_nodes: [], cycle_back_edge_sources: [],
      }),
    });

    useStore.setState({
      nodes: [
        { id: 'n-1', type: 'customInput', position: { x: 0, y: 0 }, data: {} },
        { id: 'n-2', type: 'customOutput', position: { x: 200, y: 0 }, data: {} },
      ],
      edges: [{ id: 'e-1', source: 'n-1', target: 'n-2', data: {} }],
    });

    const promise = useStore.getState().submitPipeline();
    expect(useStore.getState().dagStatus).toBe('pending');
    await promise;
    expect(useStore.getState().dagStatus).toBe('valid');
    expect(useStore.getState().nodeRoles['n-1']).toBe('outer');
    expect(useStore.getState().nodeRoles['n-2']).toBe('outer');
  });

  test('submitPipeline resolves to invalid when backend returns is_dag: false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        num_nodes: 2, num_edges: 2, is_dag: false,
        topo_order: [],
        subgraph_members: [], tool_nodes: [],
        cycle_nodes: ['n-1', 'n-2'], cycle_back_edge_sources: ['n-2'],
      }),
    });

    await useStore.getState().submitPipeline();
    expect(useStore.getState().dagStatus).toBe('invalid');
  });

  test('submitPipeline resolves to invalid when the fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));
    await useStore.getState().submitPipeline();
    expect(useStore.getState().dagStatus).toBe('invalid');
  });
});
