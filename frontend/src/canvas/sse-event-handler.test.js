import { handleSseEvent } from './sse-event-handler';

const baseState = {
  nodes: [{ id: 'n1', data: { executionState: 'idle' } }],
  nodeOutputCache: {},
  activeRunId: 'run-1',
  suspendedRun: null,
  globalState: { messages: [], variables: {} },
  runStatus: 'idle',
};

describe('handleSseEvent — node execution state', () => {
  it('sets node to running on node_started', () => {
    const patch = handleSseEvent(
      { type: 'node_started', nodeId: 'n1', timestamp: 't0' },
      baseState,
    );
    expect(patch.nodes[0].data.executionState).toBe('running');
    expect(patch.nodeOutputCache['n1'].startedAt).toBe('t0');
  });

  it('sets node to completed on node_completed', () => {
    const patch = handleSseEvent(
      { type: 'node_completed', nodeId: 'n1', duration: 1.2, timestamp: 't1' },
      baseState,
    );
    expect(patch.nodes[0].data.executionState).toBe('completed');
    expect(patch.nodeOutputCache['n1'].duration).toBe(1.2);
  });

  it('sets node to skipped on node_skipped', () => {
    const patch = handleSseEvent({ type: 'node_skipped', nodeId: 'n1' }, baseState);
    expect(patch.nodes[0].data.executionState).toBe('skipped');
  });

  it('sets node to error on node_error', () => {
    const patch = handleSseEvent(
      { type: 'node_error', nodeId: 'n1', error: { message: 'oops' } },
      baseState,
    );
    expect(patch.nodes[0].data.executionState).toBe('error');
    expect(patch.nodeOutputCache['n1'].error).toEqual({ message: 'oops' });
  });
});

describe('handleSseEvent — output caching', () => {
  it('caches output and dataType on node_output', () => {
    const patch = handleSseEvent(
      { type: 'node_output', nodeId: 'n1', output: 'hello', dataType: 'string' },
      baseState,
    );
    expect(patch.nodeOutputCache['n1'].output).toBe('hello');
    expect(patch.nodeOutputCache['n1'].dataType).toBe('string');
  });

  it('merges into existing cache entry', () => {
    const state = {
      ...baseState,
      nodeOutputCache: { 'n1': { startedAt: 't0', duration: 1.5 } },
    };
    const patch = handleSseEvent(
      { type: 'node_output', nodeId: 'n1', output: 42, dataType: 'number' },
      state,
    );
    expect(patch.nodeOutputCache['n1'].startedAt).toBe('t0');
    expect(patch.nodeOutputCache['n1'].output).toBe(42);
  });
});

describe('handleSseEvent — token streaming', () => {
  it('accumulates tokens from empty', () => {
    const patch = handleSseEvent(
      { type: 'token', nodeId: 'n1', token: 'Hi' },
      baseState,
    );
    expect(patch.nodeOutputCache['n1'].streamingText).toBe('Hi');
    expect(patch.nodeOutputCache['n1'].output).toBe('Hi');
    expect(patch.nodes[0].data.executionState).toBe('streaming');
  });

  it('appends tokens to existing accumulated text', () => {
    const state = {
      ...baseState,
      nodeOutputCache: { 'n1': { streamingText: 'Hel' } },
    };
    const patch = handleSseEvent({ type: 'token', nodeId: 'n1', token: 'lo' }, state);
    expect(patch.nodeOutputCache['n1'].streamingText).toBe('Hello');
  });

  it('preserves other cache fields when appending tokens', () => {
    const state = {
      ...baseState,
      nodeOutputCache: { 'n1': { startedAt: 't0', streamingText: 'A' } },
    };
    const patch = handleSseEvent({ type: 'token', nodeId: 'n1', token: 'B' }, state);
    expect(patch.nodeOutputCache['n1'].startedAt).toBe('t0');
    expect(patch.nodeOutputCache['n1'].streamingText).toBe('AB');
  });
});

describe('handleSseEvent — loop progress', () => {
  it('caches loop progress data', () => {
    const patch = handleSseEvent(
      { type: 'node_progress', nodeId: 'n1', data: { i: 3, total: 10, item: 'x' } },
      baseState,
    );
    expect(patch.nodeOutputCache['n1'].loopProgress).toEqual({ i: 3, total: 10, item: 'x' });
  });
});

describe('handleSseEvent — pipeline lifecycle', () => {
  it('marks suspended node and saves suspendedRun on execution_suspended', () => {
    const patch = handleSseEvent(
      { type: 'execution_suspended', nodeId: 'n1', prompt: 'Proceed?' },
      baseState,
    );
    expect(patch.nodes[0].data.executionState).toBe('suspended');
    expect(patch.suspendedRun.nodeId).toBe('n1');
    expect(patch.suspendedRun.prompt).toBe('Proceed?');
    expect(patch.suspendedRun.runId).toBe('run-1');
  });

  it('sets runStatus=completed on pipeline_completed', () => {
    const patch = handleSseEvent(
      { type: 'pipeline_completed', outputs: {}, duration: 2.5 },
      baseState,
    );
    expect(patch.runStatus).toBe('completed');
  });

  it('sets runStatus=error on execution_error', () => {
    const patch = handleSseEvent(
      { type: 'execution_error', error: { message: 'boom' } },
      baseState,
    );
    expect(patch.runStatus).toBe('error');
  });

  it('returns null for unknown event types', () => {
    expect(handleSseEvent({ type: 'unknown_xyz' }, baseState)).toBeNull();
  });
});

describe('handleSseEvent — node identity preserved', () => {
  it('only mutates the target node, leaving others unchanged', () => {
    const state = {
      ...baseState,
      nodes: [
        { id: 'n1', data: { executionState: 'idle' } },
        { id: 'n2', data: { executionState: 'idle' } },
      ],
    };
    const patch = handleSseEvent({ type: 'node_started', nodeId: 'n1' }, state);
    expect(patch.nodes[0].data.executionState).toBe('running');
    expect(patch.nodes[1].data.executionState).toBe('idle');
  });
});
