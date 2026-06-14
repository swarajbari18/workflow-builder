/** @type {import('../nodeSpecs').NodeSpec} */
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
      options: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'custom'],
      default: 'gemini-2.5-flash',
    },
    {
      name: 'customModel',
      kind: 'text',
      label: 'Custom Model Name',
      placeholder: 'e.g. gemini-3-pro',
      showIf: { model: 'custom' },
    },
    { name: 'systemPrompt', kind: 'textarea', label: 'System prompt', placeholder: 'You are a helpful assistant...' },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 10, advanced: true, info: 'Hard bound on the reasoning loop.' },
    { name: 'requireApproval', kind: 'checkbox', label: 'Require approval', default: false, advanced: true, info: 'Pause before each tool call.' },
  ],
};

export default agentSpec;
