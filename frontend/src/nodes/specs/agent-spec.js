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
      options: ['claude-opus-4-8', 'claude-sonnet-4-6', 'gpt-4o'],
      default: 'claude-sonnet-4-6',
    },
    { name: 'systemPrompt', kind: 'textarea', label: 'System prompt', placeholder: 'You are a helpful assistant...' },
    { name: 'maxIterations', kind: 'number', label: 'Max iterations', default: 10, advanced: true, info: 'Hard bound on the reasoning loop.' },
    { name: 'requireApproval', kind: 'checkbox', label: 'Require approval', default: false, advanced: true, info: 'Pause before each tool call.' },
  ],
};

export default agentSpec;
