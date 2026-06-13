/** @type {import('../nodeSpecs').NodeSpec} */
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

export default outputSpec;
