/**
 * Unit tests for the pipeline store: node creation, id generation, and the
 * immutable field update that backs the controlled inputs.
 */
import { useStore } from './store';

beforeEach(() => {
  useStore.setState({ nodes: [], edges: [], nodeIDs: {} });
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
