/**
 * Dynamic `{{variable}}` handles are generated at runtime by parsing the `content`
 * field. The static spec declares only the output handle; dynamic target handles are
 * added to the node instance by the frontend when the content field changes.
 * @type {import('../nodeSpecs').NodeSpec}
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

export default textSpec;
