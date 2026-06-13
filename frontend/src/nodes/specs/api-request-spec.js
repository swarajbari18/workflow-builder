/**
 * Redesigned as a function, not a curl command. The `fn-schema` output emits the
 * JSON Schema representation of this node as a callable function, ready for LLM
 * tool binding.
 * @type {import('../nodeSpecs').NodeSpec}
 */
const apiRequestSpec = {
  type: 'apiRequest',
  title: 'API Request',
  category: 'integration',
  execution: { kind: 'http-request' },
  toolExposable: {
    nameField: 'name',
    descriptionField: 'description',
    parametersFrom: 'fields',
    schemaOutputHandle: 'fn-schema',
  },
  handles: [
    { id: 'response', kind: 'source', side: 'right', offset: '33%', dataType: 'json' },
    { id: 'fn-schema', kind: 'source', side: 'right', offset: '66%', dataType: 'fn-schema', label: 'tool schema' },
    { id: 'error', kind: 'source', side: 'right', offset: '100%', label: 'error', dataType: 'json' },
  ],
  fields: [
    { name: 'name', kind: 'text', label: 'Function name', placeholder: 'search_users', required: true },
    { name: 'description', kind: 'textarea', label: 'What it does', placeholder: 'Search users by name' },
    { name: 'baseUrl', kind: 'text', label: 'URL', placeholder: 'https://api.example.com/v1/...' },
    { name: 'method', kind: 'select', label: 'Method', options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], default: 'GET' },
    { name: 'auth', kind: 'select', label: 'Auth', options: ['none', 'bearer', 'basic', 'apiKey'], default: 'none', advanced: true },
    { name: 'token', kind: 'text', label: 'Token', advanced: true, showIf: { auth: ['bearer', 'basic', 'apiKey'] } },
    { name: 'headers', kind: 'textarea', label: 'Headers', placeholder: '{"Content-Type":"application/json"}', advanced: true },
    { name: 'timeout', kind: 'number', label: 'Timeout (s)', default: 30, advanced: true },
  ],
};

export default apiRequestSpec;
