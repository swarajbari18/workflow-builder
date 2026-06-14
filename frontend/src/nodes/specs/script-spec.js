/**
 * Transform / Custom Script — runs a Python function over its input while the graph executes.
 *
 * This node has TWO mutually exclusive operating modes that are determined at runtime
 * by whether the `input` handle has a live wire connected to it:
 *
 *   MODE A — Data Transform (input IS connected)
 *     The node receives a concrete value, transforms it, and emits `result`.
 *     `fn-schema` is hidden — the node is not a reusable tool, it runs inline.
 *
 *   MODE B — Tool (input is NOT connected)
 *     The node exposes a callable `fn-schema` so an Agent can invoke it as a tool.
 *     The Agent provides the inputs when calling; `result` carries the return value.
 *
 * The user never writes code: they describe the transform in English and the AI writes
 * the Python (read-only, visible if they want to look). Python is the only language
 * because the backend runtime is Python — language is a runtime constraint, not a
 * user choice. Conceptually this lives in the Data category, not AI.
 * @type {import('../nodeSpecs').NodeSpec}
 */
const scriptSpec = {
  type: 'script',
  title: 'Transform',
  category: 'data',
  execution: { kind: 'code-sandbox', language: 'python' },
  toolExposable: {
    nameField: 'name',
    descriptionField: 'description',
    parametersFrom: 'handles',
    schemaOutputHandle: 'fn-schema',
  },
  handles: [
    // The `input` handle is ALWAYS present. When it is connected the node is in
    // transform mode; when it is disconnected the node is in tool mode.
    { id: 'input', kind: 'target', side: 'left', dataType: 'any', label: 'input' },
    { id: 'result', kind: 'source', side: 'right', offset: '33%', dataType: 'dynamic', label: 'result' },
    {
      id: 'fn-schema',
      kind: 'source',
      side: 'right',
      offset: '66%',
      dataType: 'fn-schema',
      label: 'tool schema',
      // Hidden whenever the `input` handle has a live edge — the node is acting as
      // a data transform at that point, not a reusable agent tool.
      hiddenWhen: { handleConnected: 'input' },
    },
    { id: 'error', kind: 'source', side: 'right', offset: '100%', label: 'error', dataType: 'json' },
  ],
  fields: [
    { name: 'name', kind: 'text', label: 'Transform name', placeholder: 'parse_json_response' },
    {
      name: 'description',
      kind: 'textarea',
      label: 'What should it do?',
      placeholder: 'parse the JSON string from the input and extract the items array',
      info: 'Describe it in plain English. The AI writes the Python that runs on your input.',
      aiAssisted: true,
    },
    { name: 'generatedCode', kind: 'code', label: 'Generated Python', readOnly: true },
    { name: 'aiExplanation', kind: 'info', label: 'What the AI wrote', readOnly: true },
  ],
  dynamicHandles: {
    trigger: 'ai-generated',
    handleKind: 'target',
    dataType: 'any',
    side: 'left',
  },
};

export default scriptSpec;
