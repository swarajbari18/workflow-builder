/**
 * Node registry — assembles NODE_SPECS from individual spec files and exports
 * the type system constants and connection validation utilities.
 *
 * Architecture
 * ------------
 * Each node type lives in its own file under `specs/`. This file is the join
 * point: it imports all specs, assembles the registry, and exports the shared
 * primitives (DATA_TYPES, isCompatibleTypes, isConnectionValid) that the rest
 * of the codebase depends on.
 *
 * nodeRegistry.js derives React Flow's `nodeTypes` map and the toolbar palette
 * from NODE_SPECS. Adding a new node = add a spec file in specs/ and one line
 * here. Nothing else changes.
 *
 * NodeSpec v2 shape:
 *   type, title, category, execution, handles, fields
 *   + optional: toolExposable, dynamicHandles
 * See individual spec files for full shape; typedefs below for the shared types.
 */

import inputSpec      from './specs/input-spec';
import outputSpec     from './specs/output-spec';
import llmSpec        from './specs/llm-spec';
import textSpec       from './specs/text-spec';
import loopSpec       from './specs/loop-spec';
import agentSpec      from './specs/agent-spec';
import webhookSpec    from './specs/webhook-spec';
import cronSpec       from './specs/cron-spec';
import conditionSpec  from './specs/condition-spec';
import apiRequestSpec from './specs/api-request-spec';
import scriptSpec     from './specs/script-spec';

/**
 * The 10 canonical data types for pipeline connections.
 * Frozen so type strings cannot be mutated at runtime.
 * @type {Readonly<{[key: string]: string}>}
 */
export const DATA_TYPES = Object.freeze({
  STRING:     'string',
  NUMBER:     'number',
  BOOLEAN:    'boolean',
  JSON:       'json',
  ARRAY:      'array',
  MESSAGES:   'message[]',
  FILE:       'file',
  FN_SCHEMA:  'fn-schema',
  TRIGGER:    'trigger',
  ANY:        'any',
});

/**
 * @typedef {Object} Handle
 * @property {string} id
 * @property {'source'|'target'} kind
 * @property {'left'|'right'} side
 * @property {string} [offset]
 * @property {string} [label]
 * @property {string} [dataType]   One of DATA_TYPES values, or 'dynamic'.
 * @property {boolean} [streamable]
 */

/**
 * @typedef {Object} Field
 * @property {string} name
 * @property {'text'|'textarea'|'number'|'select'|'checkbox'|'code'|'info'|'params'} kind
 * @property {string} [label]
 * @property {*} [default]
 * @property {string[]} [options]
 * @property {string} [placeholder]
 * @property {string} [info]
 * @property {boolean} [required]
 * @property {boolean} [advanced]
 * @property {boolean} [readOnly]
 * @property {boolean} [aiAssisted]
 * @property {Object<string, *|*[]>} [showIf]
 */

/**
 * @typedef {Object} Execution
 * @property {'suspend'|'emit'|'template'|'llm-call'|'branch'|'loop'|'http-request'|'code-sandbox'|'display'} kind
 * @property {boolean} [streamable]
 * @property {boolean} [suspendable]
 * @property {boolean} [hasSubgraph]
 * @property {boolean} [agentic]
 */

/**
 * @typedef {Object} ToolExposable
 * @property {string} nameField
 * @property {string} descriptionField
 * @property {'handles'|'fields'} parametersFrom
 * @property {string} schemaOutputHandle
 */

/**
 * @typedef {Object} DynamicHandles
 * @property {'field-parse'|'ai-generated'} trigger
 * @property {string} [fromField]
 * @property {string} [pattern]
 * @property {'source'|'target'} handleKind
 * @property {string} dataType
 * @property {'left'|'right'} side
 */

/**
 * @typedef {Object} NodeSpec
 * @property {string} type
 * @property {string} title
 * @property {string} category
 * @property {Execution} execution
 * @property {Handle[]} handles
 * @property {Field[]} fields
 * @property {ToolExposable} [toolExposable]
 * @property {DynamicHandles} [dynamicHandles]
 */

/**
 * Every node type, keyed by `type`. Registry order determines toolbar order.
 * @type {Object<string, NodeSpec>}
 */
export const NODE_SPECS = {
  customInput:  inputSpec,
  customOutput: outputSpec,
  llm:          llmSpec,
  text:         textSpec,
  loop:         loopSpec,
  agent:        agentSpec,
  webhook:      webhookSpec,
  cron:         cronSpec,
  condition:    conditionSpec,
  apiRequest:   apiRequestSpec,
  script:       scriptSpec,
};

/**
 * Returns true if a connection from sourceType to targetType is valid.
 * `any` is the wildcard — compatible with every type in both directions.
 * @param {string} sourceType
 * @param {string} targetType
 * @returns {boolean}
 */
export function isCompatibleTypes(sourceType, targetType) {
  if (sourceType === DATA_TYPES.ANY || targetType === DATA_TYPES.ANY) return true;
  return sourceType === targetType;
}

function handleDataType(nodes, nodeId, handleId) {
  const node = nodes.find((n) => n.id === nodeId);
  const spec = node && NODE_SPECS[node.type];
  const handle = spec?.handles.find((h) => `${nodeId}-${h.id}` === handleId);
  return handle?.dataType;
}

/**
 * Decides whether a proposed edge is allowed.
 *
 * Rejects duplicate edges. Type checking is gradual: a connection is only
 * blocked when both endpoints declare a concrete dataType and they are
 * incompatible. Untyped, `any`, and `dynamic` handles accept anything.
 *
 * @param {{source: string, target: string, sourceHandle: string, targetHandle: string}} connection
 * @param {Array<{id: string, type: string}>} nodes
 * @param {Array<object>} edges
 * @returns {boolean}
 */
export function isConnectionValid(connection, nodes, edges) {
  const alreadyConnected = edges.some(
    (e) =>
      e.source === connection.source &&
      e.sourceHandle === connection.sourceHandle &&
      e.target === connection.target &&
      e.targetHandle === connection.targetHandle,
  );
  if (alreadyConnected) return false;

  const sourceType = handleDataType(nodes, connection.source, connection.sourceHandle);
  const targetType = handleDataType(nodes, connection.target, connection.targetHandle);
  if (!sourceType || !targetType) return true;
  if (sourceType === 'dynamic' || targetType === 'dynamic') return true;
  return isCompatibleTypes(sourceType, targetType);
}
