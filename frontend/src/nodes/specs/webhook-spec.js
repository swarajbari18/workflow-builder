/** @type {import('../nodeSpecs').NodeSpec} */
const webhookSpec = {
  type: 'webhook',
  title: 'Webhook Trigger',
  category: 'triggers',
  execution: { kind: 'emit' },
  handles: [{ id: 'payload', kind: 'source', side: 'right', dataType: 'trigger' }],
  fields: [
    { name: 'path', kind: 'text', label: 'Path', default: '/webhook/new', placeholder: '/webhook/my-endpoint' },
    { name: 'method', kind: 'select', label: 'Method', options: ['POST', 'GET'], default: 'POST' },
    { name: 'secret', kind: 'text', label: 'Signing secret', advanced: true },
  ],
};

export default webhookSpec;
