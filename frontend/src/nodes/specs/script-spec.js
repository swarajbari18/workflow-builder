/**
 * Entirely AI-driven. The user describes the transform in plain English; AI generates
 * the code; input handles are generated from what the AI code declares as its
 * expected inputs (trigger: 'ai-generated').
 * @type {import('../nodeSpecs').NodeSpec}
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

export default scriptSpec;
