/** @type {import('../nodeSpecs').NodeSpec} */
const inputSpec = {
  type: 'customInput',
  title: 'Input',
  category: 'triggers',
  execution: { kind: 'suspend', suspendable: true },
  handles: [
    { id: 'trigger', kind: 'target', side: 'left', dataType: 'trigger', label: 'trigger' },
    { id: 'value', kind: 'source', side: 'right', dataType: 'any' },
  ],
  fields: [
    { name: 'inputName', kind: 'text', label: 'Name', default: 'input_1' },
    { name: 'inputType', kind: 'select', label: 'Type', options: ['Text', 'File'], default: 'Text' },
    { name: 'prompt', kind: 'textarea', label: 'Question for human', placeholder: 'What should the pipeline do next?' },
    { name: 'value', kind: 'textarea', label: 'Value (dev / operator)', placeholder: 'Type a test value here' },
    { name: 'notifyWebhook', kind: 'text', label: 'Notify webhook URL', advanced: true },
    { name: 'timeoutMinutes', kind: 'number', label: 'Timeout (minutes)', default: 10, advanced: true },
  ],
};

export default inputSpec;
