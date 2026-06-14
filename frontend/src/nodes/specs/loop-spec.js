/**
 * @type {import('../nodeSpecs').NodeSpec}
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

export default loopSpec;
