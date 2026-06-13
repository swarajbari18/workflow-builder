/**
 * Unit tests for the node registry.
 *
 * `isConnectionValid` covers the edge-creation rules. The "integrity" suite
 * guards the specs themselves: in a config-driven system an authoring typo
 * (a duplicate handle id, a `showIf` pointing at a missing field) fails silently
 * at runtime, so it is asserted here instead.
 */
import { NODE_SPECS, isConnectionValid } from './nodeSpecs';

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
