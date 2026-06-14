/**
 * SSE event handler — mapping backend events to store state patches.
 *
 * No side effects, no React, no DOM. 
 *
 * @param {Object} event  - Parsed SSE event
 * @param {Object} state  - Current store snapshot
 * @returns {Object|null} - Partial state to merge
 */
export function handleSseEvent(event, state) {
  switch (event.type) {
    case 'node_started':
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'running'),
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          startedAt: event.timestamp,
        }),
      };

    case 'node_completed':
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'completed'),
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          completedAt: event.timestamp,
          duration: event.duration,
        }),
      };

    case 'node_skipped':
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'skipped'),
      };

    case 'node_error':
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'error'),
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          error: event.error,
        }),
      };

    case 'node_output':
      return {
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          output: event.output,
          dataType: event.dataType,
        }),
      };

    case 'token': {
      const prev = state.nodeOutputCache[event.nodeId] ?? {};
      const accumulated = (prev.streamingText ?? '') + event.token;
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'streaming'),
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          streamingText: accumulated,
          output: accumulated,
          dataType: 'string',
        }),
      };
    }

    case 'node_progress':
      return {
        nodeOutputCache: mergeCache(state.nodeOutputCache, event.nodeId, {
          loopProgress: event.data,
        }),
      };

    case 'execution_suspended':
      return {
        nodes: applyNodeExecState(state.nodes, event.nodeId, 'suspended'),
        suspendedRun: {
          runId: state.activeRunId,
          nodeId: event.nodeId,
          prompt: event.prompt,
        },
      };

    case 'pipeline_completed':
      return { runStatus: 'completed' };

    case 'execution_error':
      return { runStatus: 'error' };

    default:
      return null;
  }
}

function applyNodeExecState(nodes, nodeId, executionState) {
  return nodes.map((n) =>
    n.id === nodeId
      ? { ...n, data: { ...n.data, executionState } }
      : n,
  );
}

function mergeCache(cache, nodeId, fields) {
  return {
    ...cache,
    [nodeId]: { ...(cache[nodeId] ?? {}), ...fields },
  };
}
