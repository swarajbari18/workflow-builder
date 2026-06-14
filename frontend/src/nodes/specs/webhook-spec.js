/** @type {import('../nodeSpecs').NodeSpec} */
const webhookSpec = {
  type: 'webhook',
  title: 'Webhook Trigger',
  category: 'triggers',
  execution: { kind: 'emit' },
  handles: [
    // Always-present: the entire incoming payload as a trigger-typed handle.
    // 'trigger' renders as a chevron and is compatible with 'any' downstream handles.
    { id: 'payload', kind: 'source', side: 'right', dataType: 'trigger', label: 'Everything' },
  ],
  fields: [
    { name: 'path',   kind: 'text',   label: 'Path',   default: '/webhook/new', placeholder: '/webhook/my-endpoint' },
    { name: 'method', kind: 'select', label: 'Method', options: ['POST', 'GET'], default: 'POST' },

    // ── Advanced ──────────────────────────────────────────────────────────────

    // Test mode: when on, the dock Run button uses samplePayload as the trigger payload.
    // Checked by store.runPipeline() — no Run button lives in the inspector.
    { name: 'testMode',      kind: 'checkbox', label: 'Test mode',              default: false, advanced: true },
    { name: 'samplePayload', kind: 'textarea', label: 'Sample payload (JSON)',
      placeholder: '{\n  "customer": "Alice",\n  "total": 99.90\n}',
      advanced: true, showIf: { testMode: true } },

    { name: 'secret', kind: 'text', label: 'Signing secret', advanced: true },

    // Internal fields managed by WebhookFieldsSection — not rendered as generic inputs.
    { name: 'receivedPayload', kind: 'text', internal: true },
    { name: 'payloadFields',   kind: 'text', internal: true },
  ],
  // Dynamic source handles: one per entry in data.payloadFields[].
  dynamicHandles: {
    trigger: 'user-declared',
    fromField: 'payloadFields',
    handleKind: 'source',
    side: 'right',
  },
};

export default webhookSpec;
