/**
 * Node blueprints — the single source of truth for the pipeline builder.
 *
 * Architecture
 * ------------
 * A node's appearance and configuration are described entirely by data: a
 * `NodeSpec` object (title, handles, fields). One generic `BaseNode` component
 * renders any spec, so adding a node type means adding an entry to `NODE_SPECS`
 * here — not writing a new React component. The same registry also drives the
 * React Flow `nodeTypes` map and the toolbar palette (see `nodeRegistry.js`),
 * keeping the canvas and the palette in sync automatically.
 *
 * The spec is UI-only and deliberately decoupled from any execution engine: this
 * is a builder, so a node describes *what it looks like and captures*, not how it
 * runs. (Tradeoff vs. Langflow's execution-fused components is intentional.)
 */

/**
 * @typedef {Object} Handle
 * @property {string} id                 Unique within the node; edges reference `${nodeId}-${id}`.
 * @property {'source'|'target'} kind    `source` = output (right), `target` = input (left).
 * @property {'left'|'right'} side
 * @property {string} [offset]           CSS `top` value (e.g. '33%') to stack handles on one side.
 * @property {string} [label]
 * @property {string} [dataType]         Optional type tag for connection validation; see isConnectionValid.
 */

/**
 * @typedef {Object} Field
 * @property {string} name               Key under which the value lives in the node's data.
 * @property {'text'|'textarea'|'number'|'select'|'checkbox'} kind
 * @property {string} [label]
 * @property {*} [default]
 * @property {string[]} [options]        Choices for `select`.
 * @property {string} [placeholder]
 * @property {string} [info]             Tooltip text.
 * @property {boolean} [required]
 * @property {boolean} [advanced]        Hidden behind a "Advanced" toggle to reduce clutter.
 * @property {Object<string, *|*[]>} [showIf]  Render only when sibling fields match these values.
 */

/**
 * @typedef {Object} NodeSpec
 * @property {string} type
 * @property {string} title
 * @property {Handle[]} handles
 * @property {Field[]} fields
 */

/** @type {NodeSpec} */
const inputSpec = {
  type: 'customInput',
  title: 'Input',
  handles: [{ id: 'value', kind: 'source', side: 'right', dataType: 'data' }],
  fields: [
    { name: 'inputName', kind: 'text', label: 'Name', default: 'input_1' },
    { name: 'inputType', kind: 'select', label: 'Type', options: ['Text', 'File'], default: 'Text' },
  ],
};

/** @type {NodeSpec} */
const outputSpec = {
  type: 'customOutput',
  title: 'Output',
  handles: [{ id: 'value', kind: 'target', side: 'left' }],
  fields: [
    { name: 'outputName', kind: 'text', label: 'Name', default: 'output_1' },
    { name: 'outputType', kind: 'select', label: 'Type', options: ['Text', 'Image'], default: 'Text' },
  ],
};

/** @type {NodeSpec} */
const llmSpec = {
  type: 'llm',
  title: 'LLM',
  handles: [
    { id: 'system', kind: 'target', side: 'left', offset: '33%', label: 'system' },
    { id: 'prompt', kind: 'target', side: 'left', offset: '66%', label: 'prompt' },
    { id: 'response', kind: 'source', side: 'right', dataType: 'text' },
  ],
  fields: [],
};

/**
 * @type {NodeSpec}
 * Part 3 extends this node with dynamic `{{variable}}` handles; the spec here
 * covers the static case and the auto-resizing/variable logic is layered on later.
 */
const textSpec = {
  type: 'text',
  title: 'Text',
  handles: [{ id: 'output', kind: 'source', side: 'right', dataType: 'text' }],
  fields: [{ name: 'text', kind: 'textarea', label: 'Text', default: '{{input}}' }],
};

/**
 * @type {NodeSpec}
 * The loop body executes as an internal sub-pipeline (a "black box"): the
 * `body`/`return` handles are conceptually loop-internal, so the surrounding
 * graph stays acyclic and the DAG check is unaffected. See loop-node-design.md.
 */
const loopSpec = {
  type: 'loop',
  title: 'Loop',
  handles: [
    { id: 'in', kind: 'target', side: 'left', offset: '33%' },
    { id: 'return', kind: 'target', side: 'left', offset: '66%', label: 'return' },
    { id: 'body', kind: 'source', side: 'right', offset: '33%', label: 'body', dataType: 'data' },
    { id: 'done', kind: 'source', side: 'right', offset: '66%', label: 'done', dataType: 'data' },
  ],
  fields: [
    { name: 'loopType', kind: 'select', label: 'Type', options: ['for', 'while', 'doWhile', 'forEach'], default: 'for' },
    { name: 'start', kind: 'number', label: 'Start', default: 0, showIf: { loopType: 'for' } },
    { name: 'end', kind: 'number', label: 'End', default: 10, showIf: { loopType: 'for' } },
    { name: 'step', kind: 'number', label: 'Step', default: 1, showIf: { loopType: 'for' } },
    { name: 'condition', kind: 'text', label: 'Condition', placeholder: 'count < 5', showIf: { loopType: ['while', 'doWhile'] } },
    { name: 'collection', kind: 'text', label: 'Collection', placeholder: 'items', showIf: { loopType: 'forEach' } },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 100, advanced: true, info: 'Safety cap on the internal loop.' },
  ],
};

/** @type {NodeSpec} */
const agentSpec = {
  type: 'agent',
  title: 'Agent',
  handles: [
    { id: 'system', kind: 'target', side: 'left', offset: '25%', label: 'system' },
    { id: 'prompt', kind: 'target', side: 'left', offset: '50%', label: 'prompt' },
    { id: 'tools', kind: 'target', side: 'left', offset: '75%', label: 'tools' },
    { id: 'response', kind: 'source', side: 'right', dataType: 'text' },
  ],
  fields: [
    { name: 'model', kind: 'select', label: 'Model', options: ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-5'], default: 'claude-sonnet-4-6' },
    { name: 'systemPrompt', kind: 'textarea', label: 'System prompt', placeholder: 'You are a helpful assistant...' },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 10, advanced: true, info: 'Hard bound on the reasoning loop.' },
    { name: 'requireApproval', kind: 'checkbox', label: 'Require approval', default: false, advanced: true, info: 'Pause for human approval before each tool call.' },
  ],
};

/** @type {NodeSpec} */
const webhookSpec = {
  type: 'webhook',
  title: 'Webhook Trigger',
  handles: [{ id: 'payload', kind: 'source', side: 'right', dataType: 'trigger' }],
  fields: [
    { name: 'path', kind: 'text', label: 'Path', default: '/webhook/new', placeholder: '/webhook/my-endpoint' },
    { name: 'method', kind: 'select', label: 'Method', options: ['POST', 'GET'], default: 'POST' },
    { name: 'secret', kind: 'text', label: 'Signing secret', advanced: true },
  ],
};

/** @type {NodeSpec} */
const cronSpec = {
  type: 'cron',
  title: 'Schedule Trigger',
  handles: [{ id: 'tick', kind: 'source', side: 'right', dataType: 'trigger' }],
  fields: [
    { name: 'scheduleType', kind: 'select', label: 'Schedule', options: ['interval', 'cron'], default: 'interval' },
    { name: 'every', kind: 'number', label: 'Every', default: 5, showIf: { scheduleType: 'interval' } },
    { name: 'unit', kind: 'select', label: 'Unit', options: ['minutes', 'hours', 'days'], default: 'minutes', showIf: { scheduleType: 'interval' } },
    { name: 'cron', kind: 'text', label: 'Cron expression', placeholder: '0 9 * * 1-5', showIf: { scheduleType: 'cron' } },
    { name: 'timezone', kind: 'text', label: 'Timezone', default: 'UTC', advanced: true },
  ],
};

/** @type {NodeSpec} */
const conditionSpec = {
  type: 'condition',
  title: 'If / Else',
  handles: [
    { id: 'in', kind: 'target', side: 'left' },
    { id: 'true', kind: 'source', side: 'right', offset: '33%', label: 'true', dataType: 'data' },
    { id: 'false', kind: 'source', side: 'right', offset: '66%', label: 'false', dataType: 'data' },
  ],
  fields: [
    { name: 'left', kind: 'text', label: 'Value', placeholder: 'value or {{var}}' },
    { name: 'operator', kind: 'select', label: 'Operator', options: ['==', '!=', '>', '<', '>=', '<=', 'contains', 'is empty'], default: '==' },
    { name: 'right', kind: 'text', label: 'Compare to', showIf: { operator: ['==', '!=', '>', '<', '>=', '<=', 'contains'] } },
  ],
};

/** @type {NodeSpec} */
const apiRequestSpec = {
  type: 'apiRequest',
  title: 'API Request',
  handles: [
    { id: 'in', kind: 'target', side: 'left', offset: '33%' },
    { id: 'body', kind: 'target', side: 'left', offset: '66%', label: 'body' },
    { id: 'response', kind: 'source', side: 'right', offset: '33%', dataType: 'data' },
    { id: 'error', kind: 'source', side: 'right', offset: '66%', label: 'error', dataType: 'data' },
  ],
  fields: [
    { name: 'url', kind: 'text', label: 'URL', placeholder: 'https://api.example.com/v1/...' },
    { name: 'method', kind: 'select', label: 'Method', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    { name: 'auth', kind: 'select', label: 'Auth', options: ['none', 'bearer', 'basic', 'apiKey'], default: 'none' },
    { name: 'token', kind: 'text', label: 'Token', showIf: { auth: ['bearer', 'basic', 'apiKey'] } },
    { name: 'headers', kind: 'textarea', label: 'Headers', placeholder: '{"Content-Type":"application/json"}', advanced: true },
    { name: 'body', kind: 'textarea', label: 'Body', placeholder: 'request body (JSON)', showIf: { method: ['POST', 'PUT', 'PATCH'] } },
    { name: 'timeout', kind: 'number', label: 'Timeout (s)', default: 30, advanced: true },
  ],
};

/**
 * Every node type, keyed by `type`. Registry order is the toolbar order.
 * @type {Object<string, NodeSpec>}
 */
export const NODE_SPECS = {
  customInput: inputSpec,
  customOutput: outputSpec,
  llm: llmSpec,
  text: textSpec,
  loop: loopSpec,
  agent: agentSpec,
  webhook: webhookSpec,
  cron: cronSpec,
  condition: conditionSpec,
  apiRequest: apiRequestSpec,
};

/**
 * Resolves the declared data type of one end of a connection, if any.
 * @param {Array<{id: string, type: string}>} nodes
 * @param {string} nodeId
 * @param {string} handleId   Full handle id as rendered, i.e. `${nodeId}-${handle.id}`.
 * @returns {string|undefined}
 */
function handleDataType(nodes, nodeId, handleId) {
  const node = nodes.find((candidate) => candidate.id === nodeId);
  const spec = node && NODE_SPECS[node.type];
  const handle = spec?.handles.find((candidate) => `${nodeId}-${candidate.id}` === handleId);
  return handle?.dataType;
}

/**
 * Decides whether a proposed edge is allowed.
 *
 * Rejects duplicate edges between the same two handles. Type checking is
 * gradual/opt-in: a connection is only blocked on type grounds when *both*
 * endpoints declare a `dataType` and the two disagree. Untyped handles accept
 * anything, so tightening connectivity is a per-handle decision and the default
 * never blocks a valid-but-unanticipated wiring. (Self-connections and broader
 * cycles are intentionally permitted here; cycle handling is the backend's job.)
 *
 * @param {{source: string, target: string, sourceHandle: string, targetHandle: string}} connection
 * @param {Array<{id: string, type: string}>} nodes  Current nodes on the canvas.
 * @param {Array<{source: string, sourceHandle: string, target: string, targetHandle: string}>} edges
 * @returns {boolean}
 */
export function isConnectionValid(connection, nodes, edges) {
  const alreadyConnected = edges.some(
    (edge) =>
      edge.source === connection.source &&
      edge.sourceHandle === connection.sourceHandle &&
      edge.target === connection.target &&
      edge.targetHandle === connection.targetHandle,
  );
  if (alreadyConnected) return false;

  const sourceType = handleDataType(nodes, connection.source, connection.sourceHandle);
  const targetType = handleDataType(nodes, connection.target, connection.targetHandle);
  if (!sourceType || !targetType) return true;
  return sourceType === targetType;
}
