/** @type {import('../nodeSpecs').NodeSpec} */
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

export default conditionSpec;
