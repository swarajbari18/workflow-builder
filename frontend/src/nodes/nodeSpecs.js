/**
 * Node blueprints — the single source of truth for the pipeline builder.
 *
 * Architecture
 * ------------
 * A node's appearance and configuration are described entirely by data: a
 * `NodeSpec` object. One generic `BaseNode` component renders any spec, so
 * adding a node type means adding an entry to `NODE_SPECS` here — not writing
 * a new React component. The same registry also drives the React Flow
 * `nodeTypes` map and the toolbar palette (see `nodeRegistry.js`), keeping the
 * canvas and the palette in sync automatically.
 *
 * NodeSpec v2 adds five dimensions beyond UI structure (Phase 1):
 *   execution   — the join point with the backend executor registry
 *   category    — drives toolbar grouping and category accent colour
 *   toolExposable — nodes that can expose themselves as LLM-callable functions
 *   dynamicHandles — handles generated at runtime from field content
 *   aiAssisted  — fields that trigger the AI conversation panel
 *
 * Data type system: 10 types replacing the previous 3. Use DATA_TYPES constants
 * instead of string literals. isCompatibleTypes() is the type-checking primitive
 * for connection validation and connection-mode UI.
 */

/**
 * The 10 canonical data types for pipeline connections.
 * Frozen so string literals can never be mutated at runtime.
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
 * @property {string} id                  Unique within the node; edges reference `${nodeId}-${id}`.
 * @property {'source'|'target'} kind     `source` = output (right), `target` = input (left).
 * @property {'left'|'right'} side
 * @property {string} [offset]            CSS `top` value (e.g. '33%') to stack handles on one side.
 * @property {string} [label]
 * @property {string} [dataType]          One of DATA_TYPES values, or 'dynamic' (type known at runtime).
 * @property {boolean} [streamable]       True if this handle can emit tokens during LLM streaming.
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
 * @property {boolean} [aiAssisted]       When true, focusing this field opens the AI conversation panel.
 * @property {Object<string, *|*[]>} [showIf]
 */

/**
 * @typedef {Object} Execution
 * @property {'suspend'|'emit'|'template'|'llm-call'|'branch'|'loop'|'http-request'|'code-sandbox'|'display'} kind
 *   The string the backend executor registry uses to dispatch to the correct executor class.
 * @property {boolean} [streamable]       Frontend shows streaming animation while this node runs.
 * @property {boolean} [suspendable]      This node can halt pipeline execution (Input node).
 * @property {boolean} [hasSubgraph]      Nodes connected to certain handles form an internal sub-pipeline.
 * @property {boolean} [agentic]          LLM executor runs an agentic tool-use loop, not a single pass.
 */

/**
 * @typedef {Object} ToolExposable
 * @property {string} nameField           Field name that provides the function identifier.
 * @property {string} descriptionField    Field name that provides the function description.
 * @property {'handles'|'fields'} parametersFrom
 * @property {string} schemaOutputHandle  Handle id that emits the JSON Schema.
 */

/**
 * @typedef {Object} DynamicHandles
 * @property {'field-parse'|'ai-generated'} trigger
 *   `field-parse` = handles derived from a regex over a text field value.
 *   `ai-generated` = handles come from the AI code generation response.
 * @property {string} [fromField]         Field to parse (only for `field-parse`).
 * @property {string} [pattern]           Regex source string to extract variable names.
 * @property {'source'|'target'} handleKind
 * @property {string} dataType
 * @property {'left'|'right'} side
 */

/**
 * @typedef {Object} NodeSpec
 * @property {string} type
 * @property {string} title
 * @property {string} category            One of: triggers | ai | data | control | integration | output
 * @property {Execution} execution
 * @property {Handle[]} handles
 * @property {Field[]} fields
 * @property {ToolExposable} [toolExposable]
 * @property {DynamicHandles} [dynamicHandles]
 */

/** @type {NodeSpec} */
const inputSpec = {
  type: 'customInput',
  title: 'Input',
  category: 'triggers',
  execution: { kind: 'suspend', suspendable: true },
  handles: [
    { id: 'trigger', kind: 'target', side: 'left', dataType: 'trigger', label: 'trigger' },
    { id: 'value', kind: 'source', side: 'right', dataType: 'any' },
  ],
  fields: [
    { name: 'inputName', kind: 'text', label: 'Name', default: 'input_1' },
    { name: 'inputType', kind: 'select', label: 'Type', options: ['Text', 'File'], default: 'Text' },
    { name: 'prompt', kind: 'textarea', label: 'Question for human', placeholder: 'What should the pipeline do next?' },
    { name: 'value', kind: 'textarea', label: 'Value (dev / operator)', placeholder: 'Type a test value here' },
    { name: 'notifyWebhook', kind: 'text', label: 'Notify webhook URL', advanced: true },
    { name: 'timeoutMinutes', kind: 'number', label: 'Timeout (minutes)', default: 10, advanced: true },
  ],
};

/** @type {NodeSpec} */
const outputSpec = {
  type: 'customOutput',
  title: 'Output',
  category: 'output',
  execution: { kind: 'display' },
  handles: [{ id: 'value', kind: 'target', side: 'left', dataType: 'any' }],
  fields: [
    { name: 'outputName', kind: 'text', label: 'Name', default: 'output_1' },
    { name: 'outputType', kind: 'select', label: 'Type', options: ['Text', 'Image'], default: 'Text' },
  ],
};

/** @type {NodeSpec} */
const llmSpec = {
  type: 'llm',
  title: 'LLM',
  category: 'ai',
  execution: { kind: 'llm-call', streamable: true },
  handles: [
    { id: 'system', kind: 'target', side: 'left', offset: '25%', label: 'system', dataType: 'string' },
    { id: 'prompt', kind: 'target', side: 'left', offset: '50%', label: 'prompt', dataType: 'string' },
    { id: 'tools', kind: 'target', side: 'left', offset: '75%', label: 'tools', dataType: 'fn-schema' },
    { id: 'response', kind: 'source', side: 'right', dataType: 'string', streamable: true },
  ],
  fields: [
    {
      name: 'model',
      kind: 'select',
      label: 'Model',
      options: ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-4o'],
      default: 'claude-sonnet-4-6',
    },
    { name: 'systemPrompt', kind: 'textarea', label: 'System prompt (inline)', placeholder: 'You are a helpful assistant' },
    { name: 'promptText', kind: 'textarea', label: 'Prompt (inline)', placeholder: 'Ask something...' },
    { name: 'includeHistory', kind: 'checkbox', label: 'Include conversation history', default: true },
    { name: 'historyLength', kind: 'number', label: 'History messages', default: 10, advanced: true, showIf: { includeHistory: true } },
    { name: 'temperature', kind: 'number', label: 'Temperature', default: 0.7, advanced: true },
    { name: 'maxTokens', kind: 'number', label: 'Max tokens', default: 2048, advanced: true },
  ],
};

/**
 * Dynamic `{{variable}}` handles are generated at runtime by parsing the `content`
 * field. The static spec declares the output handle only; dynamic target handles are
 * added to the node instance by the frontend when the content field changes.
 * @type {NodeSpec}
 */
const textSpec = {
  type: 'text',
  title: 'Text',
  category: 'data',
  execution: { kind: 'template' },
  handles: [{ id: 'output', kind: 'source', side: 'right', dataType: 'string' }],
  fields: [{ name: 'content', kind: 'textarea', label: 'Template', default: '{{input}}' }],
  dynamicHandles: {
    trigger: 'field-parse',
    fromField: 'content',
    pattern: '\\{\\{(\\w+)\\}\\}',
    handleKind: 'target',
    dataType: 'any',
    side: 'left',
  },
};

/**
 * The loop body executes as an internal sub-pipeline (a "black box"): nodes
 * connected to the `item` handle run inside the executor per iteration, so the
 * surrounding graph stays acyclic and the DAG check is unaffected.
 * @type {NodeSpec}
 */
const loopSpec = {
  type: 'loop',
  title: 'Repeat',
  category: 'control',
  execution: { kind: 'loop', hasSubgraph: true },
  handles: [
    { id: 'list', kind: 'target', side: 'left', dataType: 'array', label: 'list' },
    { id: 'item', kind: 'source', side: 'right', offset: '33%', label: 'item', dataType: 'any' },
    { id: 'results', kind: 'source', side: 'right', offset: '66%', label: 'results', dataType: 'array' },
  ],
  fields: [
    {
      name: 'mode',
      kind: 'select',
      label: 'Mode',
      options: ['For each item in a list', 'While a condition is true'],
      default: 'For each item in a list',
    },
    {
      name: 'condition',
      kind: 'textarea',
      label: 'Condition',
      placeholder: 'while the score is below 0.8',
      aiAssisted: true,
      showIf: { mode: 'While a condition is true' },
    },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 100, advanced: true, info: 'Safety cap.' },
  ],
};

/** @type {NodeSpec} */
const agentSpec = {
  type: 'agent',
  title: 'Agent',
  category: 'ai',
  execution: { kind: 'llm-call', agentic: true },
  handles: [
    { id: 'system', kind: 'target', side: 'left', offset: '25%', label: 'system', dataType: 'string' },
    { id: 'prompt', kind: 'target', side: 'left', offset: '50%', label: 'prompt', dataType: 'string' },
    { id: 'tools', kind: 'target', side: 'left', offset: '75%', label: 'tools', dataType: 'fn-schema' },
    { id: 'response', kind: 'source', side: 'right', dataType: 'string' },
  ],
  fields: [
    {
      name: 'model',
      kind: 'select',
      label: 'Model',
      options: ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-4o'],
      default: 'claude-sonnet-4-6',
    },
    { name: 'systemPrompt', kind: 'textarea', label: 'System prompt', placeholder: 'You are a helpful assistant...' },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 10, advanced: true, info: 'Hard bound on the reasoning loop.' },
    { name: 'requireApproval', kind: 'checkbox', label: 'Require approval', default: false, advanced: true, info: 'Pause before each tool call.' },
  ],
};

/** @type {NodeSpec} */
const webhookSpec = {
  type: 'webhook',
  title: 'Webhook Trigger',
  category: 'triggers',
  execution: { kind: 'emit' },
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
  category: 'triggers',
  execution: { kind: 'emit' },
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
  category: 'control',
  execution: { kind: 'branch' },
  handles: [
    { id: 'in', kind: 'target', side: 'left', dataType: 'any' },
    { id: 'true', kind: 'source', side: 'right', offset: '33%', label: 'true', dataType: 'any' },
    { id: 'false', kind: 'source', side: 'right', offset: '66%', label: 'false', dataType: 'any' },
  ],
  fields: [
    {
      name: 'description',
      kind: 'textarea',
      label: 'Condition in plain English',
      placeholder: 'if the score is above 0.7',
      aiAssisted: true,
    },
    { name: 'generatedCode', kind: 'code', label: 'Generated code', readOnly: true, advanced: true },
    { name: 'aiExplanation', kind: 'info', label: 'AI explanation', readOnly: true },
  ],
};

/**
 * Redesigned as a function, not a curl command. The `fn-schema` output emits the
 * JSON Schema representation of this node as a callable function, ready for LLM
 * tool binding.
 * @type {NodeSpec}
 */
const apiRequestSpec = {
  type: 'apiRequest',
  title: 'API Request',
  category: 'integration',
  execution: { kind: 'http-request' },
  toolExposable: {
    nameField: 'name',
    descriptionField: 'description',
    parametersFrom: 'fields',
    schemaOutputHandle: 'fn-schema',
  },
  handles: [
    { id: 'response', kind: 'source', side: 'right', offset: '33%', dataType: 'json' },
    { id: 'fn-schema', kind: 'source', side: 'right', offset: '66%', dataType: 'fn-schema', label: 'tool schema' },
    { id: 'error', kind: 'source', side: 'right', offset: '100%', label: 'error', dataType: 'json' },
  ],
  fields: [
    { name: 'name', kind: 'text', label: 'Function name', placeholder: 'search_users', required: true },
    { name: 'description', kind: 'textarea', label: 'What it does', placeholder: 'Search users by name' },
    { name: 'baseUrl', kind: 'text', label: 'URL', placeholder: 'https://api.example.com/v1/...' },
    { name: 'method', kind: 'select', label: 'Method', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    { name: 'auth', kind: 'select', label: 'Auth', options: ['none', 'bearer', 'basic', 'apiKey'], default: 'none', advanced: true },
    { name: 'token', kind: 'text', label: 'Token', advanced: true, showIf: { auth: ['bearer', 'basic', 'apiKey'] } },
    { name: 'headers', kind: 'textarea', label: 'Headers', placeholder: '{"Content-Type":"application/json"}', advanced: true },
    { name: 'timeout', kind: 'number', label: 'Timeout (s)', default: 30, advanced: true },
  ],
};

/**
 * Entirely AI-driven. The user describes the transform in plain English; AI generates
 * the code; input handles are generated from what the AI code declares as its
 * expected inputs (trigger: 'ai-generated').
 * @type {NodeSpec}
 */
const scriptSpec = {
  type: 'script',
  title: 'Transform',
  category: 'ai',
  execution: { kind: 'code-sandbox' },
  toolExposable: {
    nameField: 'name',
    descriptionField: 'description',
    parametersFrom: 'handles',
    schemaOutputHandle: 'fn-schema',
  },
  handles: [
    { id: 'result', kind: 'source', side: 'right', offset: '33%', dataType: 'dynamic' },
    { id: 'fn-schema', kind: 'source', side: 'right', offset: '66%', dataType: 'fn-schema', label: 'tool schema' },
    { id: 'error', kind: 'source', side: 'right', offset: '100%', label: 'error', dataType: 'json' },
  ],
  fields: [
    { name: 'name', kind: 'text', label: 'Transform name', placeholder: 'parse_json_response' },
    {
      name: 'description',
      kind: 'textarea',
      label: 'What should it do?',
      placeholder: 'parse the JSON string from the LLM output and extract the items array',
      aiAssisted: true,
    },
    { name: 'generatedCode', kind: 'code', label: 'Generated code', readOnly: true },
    { name: 'aiExplanation', kind: 'info', label: 'AI explanation', readOnly: true },
    { name: 'language', kind: 'select', label: 'Language', options: ['python', 'javascript'], default: 'python', advanced: true },
  ],
  dynamicHandles: {
    trigger: 'ai-generated',
    handleKind: 'target',
    dataType: 'any',
    side: 'left',
  },
};

/**
 * Every node type, keyed by `type`. Registry order determines toolbar order within
 * each category. Adding a spec here makes it available on the canvas AND in the
 * toolbar automatically (via nodeRegistry.js).
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
 * Returns true if a connection from sourceType to targetType is semantically valid.
 * `any` is the wildcard — it is compatible with every other type in both directions.
 * Two concrete types must match exactly.
 * @param {string} sourceType
 * @param {string} targetType
 * @returns {boolean}
 */
export function isCompatibleTypes(sourceType, targetType) {
  if (sourceType === DATA_TYPES.ANY || targetType === DATA_TYPES.ANY) return true;
  return sourceType === targetType;
}

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
 * Rejects duplicate edges between the same two handles. Type checking uses
 * isCompatibleTypes: a connection is only blocked when both endpoints declare
 * a concrete dataType and they are not compatible. Untyped handles and `any`
 * handles accept anything. `dynamic` handles accept anything (type is only
 * known after the first run).
 *
 * @param {{source: string, target: string, sourceHandle: string, targetHandle: string}} connection
 * @param {Array<{id: string, type: string}>} nodes
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
  if (sourceType === 'dynamic' || targetType === 'dynamic') return true;
  return isCompatibleTypes(sourceType, targetType);
}
