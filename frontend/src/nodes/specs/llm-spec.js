/** @type {import('../nodeSpecs').NodeSpec} */
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

export default llmSpec;
