/**
 * Transform — runs a Python script over its input while the graph executes.
 *
 * The user never writes code: they describe the transform in English and the AI writes
 * the Python (read-only, visible if they want to look). It is Python specifically
 * because the backend runtime that executes the graph is Python — language is a runtime
 * constraint, not a user choice, so there is no language field. Conceptually this is a
 * data transformation, not an "AI feature" like the LLM/Agent nodes, so it lives in the
 * Data category. It always has an `input` handle; the AI may declare additional inputs.
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
    { id: 'input', kind: 'target', side: 'left', dataType: 'any', label: 'input' },
    { id: 'result', kind: 'source', side: 'right', offset: '33%', dataType: 'dynamic', label: 'result' },
    { id: 'fn-schema', kind: 'source', side: 'right', offset: '66%', dataType: 'fn-schema', label: 'tool schema' },
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
