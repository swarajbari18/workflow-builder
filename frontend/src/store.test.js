/**
 * Unit tests for the pipeline store: node creation, id generation, immutable
 * field update, connection mode, command palette, and context menu state.
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
