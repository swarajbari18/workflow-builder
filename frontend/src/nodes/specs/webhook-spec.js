/** @type {import('../nodeSpecs').NodeSpec} */
const webhookSpec = {
  type: 'webhook',
  title: 'Webhook Trigger',
  category: 'triggers',
  execution: { kind: 'emit' },
  handles: [
    // Always-present: the entire incoming payload as a trigger-typed handle.
    // 'trigger' renders as a chevron and is compatible with 'any' downstream handles.
    // Use this when you want to pass the full payload blob downstream.
    { id: 'payload', kind: 'source', side: 'right', dataType: 'trigger', label: 'Everything' },
  ],
  fields: [
    { name: 'path',   kind: 'text',   label: 'Path',           default: '/webhook/new', placeholder: '/webhook/my-endpoint' },
    { name: 'method', kind: 'select', label: 'Method',         options: ['POST', 'GET'], default: 'POST' },
    { name: 'secret', kind: 'text',   label: 'Signing secret', advanced: true },
    // Internal fields managed by the WebhookNode UI, not the generic inspector.
    // receivedPayload: the last captured test event — shows the "Got your data!" preview.
    // payloadFields: array of {key, label, dataType} objects the user has chosen to expose.
    { name: 'receivedPayload', kind: 'text', advanced: true },
    { name: 'payloadFields',   kind: 'text', advanced: true },
  ],
  // Dynamic source handles: one per entry in data.payloadFields[].
  // The WebhookNode component manages adding/removing — BaseNode does not auto-parse these.
  dynamicHandles: {
    trigger: 'user-declared',  // new trigger type: managed imperatively by the node component
    fromField: 'payloadFields',
    handleKind: 'source',
    side: 'right',
  },
};

export default webhookSpec;
