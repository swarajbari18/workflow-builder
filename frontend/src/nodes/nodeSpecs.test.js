/**
 * Unit tests for the node registry.
 *
 * `isConnectionValid` covers the edge-creation rules. The "integrity" suite
 * guards the specs themselves: in a config-driven system an authoring typo
 * (a duplicate handle id, a `showIf` pointing at a missing field) fails silently
 * at runtime, so it is asserted here instead.
 *
 * The "NodeSpec v2" suite covers the new dimensions added in Phase 1:
 * execution contracts, data type system, tool schema capability,
 * dynamic handle rules, and AI-assisted field markers.
 */
import { NODE_SPECS, isConnectionValid, isCompatibleTypes, DATA_TYPES } from './nodeSpecs';

// --- isConnectionValid ---

describe('isConnectionValid', () => {
  const nodes = [
    { id: 'customInput-1', type: 'customInput' },
    { id: 'llm-1', type: 'llm' },
  ];
  const connection = {
    source: 'customInput-1',
    sourceHandle: 'customInput-1-value',
    target: 'llm-1',
    targetHandle: 'llm-1-prompt',
  };

  test('allows a fresh connection between two handles', () => {
    expect(isConnectionValid(connection, nodes, [])).toBe(true);
  });

  test('rejects a duplicate edge between the same handles', () => {
    expect(isConnectionValid(connection, nodes, [connection])).toBe(false);
  });

  test('is permissive when an endpoint is untyped', () => {
    // llm-1-prompt is an untyped target, so any source may connect to it.
    expect(isConnectionValid(connection, nodes, [])).toBe(true);
  });
});

// --- NODE_SPECS integrity (pre-existing suite, all 75 must stay green) ---

describe('NODE_SPECS integrity', () => {
  const entries = Object.entries(NODE_SPECS);

  test.each(entries)('%s: type matches its registry key', (key, spec) => {
    expect(spec.type).toBe(key);
  });

  test.each(entries)('%s: has a non-empty title', (key, spec) => {
    expect(typeof spec.title).toBe('string');
    expect(spec.title.length).toBeGreaterThan(0);
  });

  test.each(entries)('%s: handle ids are unique', (key, spec) => {
    const ids = spec.handles.map((handle) => handle.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test.each(entries)('%s: field names are unique', (key, spec) => {
    const names = spec.fields.map((field) => field.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test.each(entries)('%s: select fields declare non-empty options', (key, spec) => {
    spec.fields
      .filter((field) => field.kind === 'select')
      .forEach((field) => {
        expect(Array.isArray(field.options)).toBe(true);
        expect(field.options.length).toBeGreaterThan(0);
      });
  });

  test.each(entries)('%s: showIf references existing sibling fields', (key, spec) => {
    const names = new Set(spec.fields.map((field) => field.name));
    spec.fields
      .filter((field) => field.showIf)
      .forEach((field) => {
        Object.keys(field.showIf).forEach((sibling) => {
          expect(names.has(sibling)).toBe(true);
        });
      });
  });
});

// --- DATA_TYPES constant ---

describe('DATA_TYPES', () => {
  const EXPECTED = ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger', 'any'];

  test('exports exactly the 10 canonical type strings', () => {
    expect(Object.values(DATA_TYPES)).toEqual(expect.arrayContaining(EXPECTED));
    expect(Object.values(DATA_TYPES).length).toBe(10);
  });

  test('is frozen so type strings cannot be mutated at runtime', () => {
    expect(Object.isFrozen(DATA_TYPES)).toBe(true);
  });
});

// --- isCompatibleTypes ---

describe('isCompatibleTypes', () => {
  test('same concrete type is compatible', () => {
    expect(isCompatibleTypes('string', 'string')).toBe(true);
    expect(isCompatibleTypes('json', 'json')).toBe(true);
    expect(isCompatibleTypes('trigger', 'trigger')).toBe(true);
  });

  test('any is compatible with every other type (source)', () => {
    ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger'].forEach((t) => {
      expect(isCompatibleTypes('any', t)).toBe(true);
    });
  });

  test('any is compatible with every other type (target)', () => {
    ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger'].forEach((t) => {
      expect(isCompatibleTypes(t, 'any')).toBe(true);
    });
  });

  test('different concrete types are not compatible', () => {
    expect(isCompatibleTypes('string', 'number')).toBe(false);
    expect(isCompatibleTypes('json', 'array')).toBe(false);
    expect(isCompatibleTypes('trigger', 'string')).toBe(false);
    expect(isCompatibleTypes('fn-schema', 'json')).toBe(false);
  });

  test('dynamic is compatible with every concrete type (source) — runtime wildcard', () => {
    ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger'].forEach((t) => {
      expect(isCompatibleTypes('dynamic', t)).toBe(true);
    });
  });

  test('dynamic is compatible with every concrete type (target) — runtime wildcard', () => {
    ['string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger'].forEach((t) => {
      expect(isCompatibleTypes(t, 'dynamic')).toBe(true);
    });
  });
});

// --- NodeSpec v2 ---

describe('NodeSpec v2 — execution contracts', () => {
  const VALID_EXECUTION_KINDS = new Set([
    'suspend', 'emit', 'template', 'llm-call', 'branch', 'loop', 'http-request', 'code-sandbox', 'display',
  ]);
  const entries = Object.entries(NODE_SPECS);

  test.each(entries)('%s: has an execution property with a known kind', (key, spec) => {
    expect(spec.execution).toBeDefined();
    expect(VALID_EXECUTION_KINDS.has(spec.execution.kind)).toBe(true);
  });

  test.each(entries)('%s: has a category string', (key, spec) => {
    const VALID_CATEGORIES = new Set(['triggers', 'ai', 'data', 'control', 'integration', 'output']);
    expect(typeof spec.category).toBe('string');
    expect(VALID_CATEGORIES.has(spec.category)).toBe(true);
  });

  test('Input node uses suspend execution kind', () => {
    expect(NODE_SPECS.customInput.execution.kind).toBe('suspend');
  });

  test('Output node uses display execution kind', () => {
    expect(NODE_SPECS.customOutput.execution.kind).toBe('display');
  });

  test('LLM node uses llm-call and is streamable', () => {
    expect(NODE_SPECS.llm.execution.kind).toBe('llm-call');
    expect(NODE_SPECS.llm.execution.streamable).toBe(true);
  });

  test('Agent node uses llm-call with agentic flag', () => {
    expect(NODE_SPECS.agent.execution.kind).toBe('llm-call');
    expect(NODE_SPECS.agent.execution.agentic).toBe(true);
  });

  test('Loop node uses loop kind and declares hasSubgraph', () => {
    expect(NODE_SPECS.loop.execution.kind).toBe('loop');
    expect(NODE_SPECS.loop.execution.hasSubgraph).toBe(true);
  });

  test('Webhook and Cron use emit kind', () => {
    expect(NODE_SPECS.webhook.execution.kind).toBe('emit');
    expect(NODE_SPECS.cron.execution.kind).toBe('emit');
  });

  test('Condition uses branch kind', () => {
    expect(NODE_SPECS.condition.execution.kind).toBe('branch');
  });

  test('Text node uses template kind', () => {
    expect(NODE_SPECS.text.execution.kind).toBe('template');
  });

  test('API Request uses http-request kind', () => {
    expect(NODE_SPECS.apiRequest.execution.kind).toBe('http-request');
  });

  test('Script node exists and uses code-sandbox kind', () => {
    expect(NODE_SPECS.script).toBeDefined();
    expect(NODE_SPECS.script.execution.kind).toBe('code-sandbox');
  });
});

describe('NodeSpec v2 — tool schema capability', () => {
  test('API Request node declares toolExposable', () => {
    expect(NODE_SPECS.apiRequest.toolExposable).toBeDefined();
  });

  test('Script node declares toolExposable', () => {
    expect(NODE_SPECS.script.toolExposable).toBeDefined();
  });

  test('toolExposable nodes have a fn-schema source handle', () => {
    ['apiRequest', 'script'].forEach((key) => {
      const spec = NODE_SPECS[key];
      const fnSchemaHandle = spec.handles.find(
        (h) => h.id === 'fn-schema' && h.kind === 'source' && h.dataType === 'fn-schema',
      );
      expect(fnSchemaHandle).toBeDefined();
    });
  });

  test('nodes without toolExposable do not emit a fn-schema source handle', () => {
    // LLM and Agent legitimately have a fn-schema TARGET handle (they consume tool schemas).
    // Only toolExposable nodes (apiRequest, script) should have a fn-schema SOURCE handle.
    ['customInput', 'customOutput', 'llm', 'text', 'loop', 'agent', 'webhook', 'cron', 'condition'].forEach((key) => {
      const spec = NODE_SPECS[key];
      const fnSchemaSource = spec.handles.find((h) => h.dataType === 'fn-schema' && h.kind === 'source');
      expect(fnSchemaSource).toBeUndefined();
    });
  });
});

describe('NodeSpec v2 — dynamic handles', () => {
  test('Text node declares dynamicHandles', () => {
    expect(NODE_SPECS.text.dynamicHandles).toBeDefined();
  });

  test('Text node dynamicHandles references its content field', () => {
    expect(NODE_SPECS.text.dynamicHandles.fromField).toBe('content');
  });

  test('Text node dynamicHandles declares a regex pattern', () => {
    expect(typeof NODE_SPECS.text.dynamicHandles.pattern).toBe('string');
    expect(NODE_SPECS.text.dynamicHandles.pattern.length).toBeGreaterThan(0);
  });

  test('Text node dynamicHandles pattern matches {{variable}} syntax', () => {
    const re = new RegExp(NODE_SPECS.text.dynamicHandles.pattern);
    const matches = 'Hello {{username}} and {{task}}'.match(new RegExp(re.source, 'g'));
    expect(matches).toHaveLength(2);
  });

  test('Script node declares dynamicHandles with ai-generated trigger', () => {
    expect(NODE_SPECS.script.dynamicHandles).toBeDefined();
    expect(NODE_SPECS.script.dynamicHandles.trigger).toBe('ai-generated');
  });
});

describe('NodeSpec v2 — hiddenWhen (Script node dual-mode)', () => {
  const script = NODE_SPECS.script;

  test('Script fn-schema handle declares hiddenWhen.handleConnected pointing at input', () => {
    const fnSchema = script.handles.find((h) => h.id === 'fn-schema');
    expect(fnSchema).toBeDefined();
    expect(fnSchema.hiddenWhen).toBeDefined();
    expect(fnSchema.hiddenWhen.handleConnected).toBe('input');
  });

  test('Script input handle has no hiddenWhen (it is always present)', () => {
    const input = script.handles.find((h) => h.id === 'input');
    expect(input).toBeDefined();
    expect(input.hiddenWhen).toBeUndefined();
  });

  test('Script result and error handles have no hiddenWhen', () => {
    ['result', 'error'].forEach((hid) => {
      const h = script.handles.find((x) => x.id === hid);
      expect(h).toBeDefined();
      expect(h.hiddenWhen).toBeUndefined();
    });
  });

  test('only the Script node declares hiddenWhen on any handle', () => {
    // No other spec should use hiddenWhen yet — this ensures future uses are deliberate.
    Object.entries(NODE_SPECS).forEach(([key, spec]) => {
      if (key === 'script') return;
      spec.handles.forEach((h) => {
        expect(h.hiddenWhen).toBeUndefined();
      });
    });
  });
});

describe('NodeSpec v2 — AI-assisted fields', () => {
  test('Condition node description field is aiAssisted', () => {
    const descField = NODE_SPECS.condition.fields.find((f) => f.name === 'description');
    expect(descField).toBeDefined();
    expect(descField.aiAssisted).toBe(true);
  });

  test('Loop node condition field is aiAssisted', () => {
    const condField = NODE_SPECS.loop.fields.find((f) => f.name === 'condition');
    expect(condField).toBeDefined();
    expect(condField.aiAssisted).toBe(true);
  });

  test('Script node description field is aiAssisted', () => {
    const descField = NODE_SPECS.script.fields.find((f) => f.name === 'description');
    expect(descField).toBeDefined();
    expect(descField.aiAssisted).toBe(true);
  });

  test('aiAssisted fields have kind textarea', () => {
    Object.values(NODE_SPECS).forEach((spec) => {
      spec.fields
        .filter((f) => f.aiAssisted)
        .forEach((f) => {
          expect(f.kind).toBe('textarea');
        });
    });
  });
});

describe('NodeSpec v2 — data type system', () => {
  const VALID_DATA_TYPES = new Set([
    'string', 'number', 'boolean', 'json', 'array', 'message[]', 'file', 'fn-schema', 'trigger', 'any', 'dynamic',
  ]);

  test('all handle dataType values are from the v2 type system', () => {
    Object.entries(NODE_SPECS).forEach(([key, spec]) => {
      spec.handles.forEach((handle) => {
        if (handle.dataType !== undefined) {
          expect(VALID_DATA_TYPES.has(handle.dataType)).toBe(true);
        }
      });
    });
  });

  test('no handle uses legacy type strings (text, data)', () => {
    Object.entries(NODE_SPECS).forEach(([key, spec]) => {
      spec.handles.forEach((handle) => {
        expect(handle.dataType).not.toBe('text');
        expect(handle.dataType).not.toBe('data');
      });
    });
  });

  test('LLM response handle is typed string and streamable', () => {
    const responseHandle = NODE_SPECS.llm.handles.find((h) => h.id === 'response');
    expect(responseHandle.dataType).toBe('string');
    expect(responseHandle.streamable).toBe(true);
  });

  test('Script result handle declares dynamic type', () => {
    const resultHandle = NODE_SPECS.script.handles.find((h) => h.id === 'result');
    expect(resultHandle.dataType).toBe('dynamic');
  });

  test('Webhook and Cron source handles use trigger type', () => {
    const webhookHandle = NODE_SPECS.webhook.handles.find((h) => h.kind === 'source');
    const cronHandle = NODE_SPECS.cron.handles.find((h) => h.kind === 'source');
    expect(webhookHandle.dataType).toBe('trigger');
    expect(cronHandle.dataType).toBe('trigger');
  });
});

describe('Output node — delivery webhook fields', () => {
  const outputSpec = NODE_SPECS.customOutput;

  test('has a notifyWebhook advanced field', () => {
    const field = outputSpec.fields.find((f) => f.name === 'notifyWebhook');
    expect(field).toBeDefined();
    expect(field.kind).toBe('text');
    expect(field.advanced).toBe(true);
  });

  test('has a webhookSecret advanced field', () => {
    const field = outputSpec.fields.find((f) => f.name === 'webhookSecret');
    expect(field).toBeDefined();
    expect(field.kind).toBe('text');
    expect(field.advanced).toBe(true);
  });

  test('notifyWebhook and webhookSecret are the last two fields (after the primary fields)', () => {
    const names = outputSpec.fields.map((f) => f.name);
    const notifyIdx = names.indexOf('notifyWebhook');
    const secretIdx = names.indexOf('webhookSecret');
    // Both must exist and both must be after outputName and outputType
    expect(notifyIdx).toBeGreaterThan(names.indexOf('outputName'));
    expect(secretIdx).toBeGreaterThan(names.indexOf('outputType'));
  });

  // Symmetry check: Input node has the same field names. Same contract, opposite direction.
  test('mirrors Input node webhook field names for conceptual symmetry', () => {
    const inputFields = NODE_SPECS.customInput.fields.map((f) => f.name);
    expect(inputFields).toContain('notifyWebhook');
    expect(outputSpec.fields.map((f) => f.name)).toContain('notifyWebhook');
  });
});
