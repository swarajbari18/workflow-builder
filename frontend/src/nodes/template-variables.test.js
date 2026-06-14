import { parseTemplateVariables, variableHandles } from './template-variables';

describe('parseTemplateVariables', () => {
  test('extracts a single variable', () => {
    expect(parseTemplateVariables('Hello {{name}}')).toEqual(['name']);
  });

  test('extracts multiple variables in order of first appearance', () => {
    expect(parseTemplateVariables('You are helping {{username}} with {{task}}')).toEqual([
      'username',
      'task',
    ]);
  });

  test('deduplicates repeated variables, keeping first-seen order', () => {
    expect(parseTemplateVariables('{{a}} then {{b}} then {{a}}')).toEqual(['a', 'b']);
  });

  test('tolerates whitespace inside the braces', () => {
    expect(parseTemplateVariables('{{  name  }} and {{ task}}')).toEqual(['name', 'task']);
  });

  test('returns an empty array when there are no variables', () => {
    expect(parseTemplateVariables('just plain text')).toEqual([]);
  });

  test('returns an empty array for empty, null, or undefined content', () => {
    expect(parseTemplateVariables('')).toEqual([]);
    expect(parseTemplateVariables(null)).toEqual([]);
    expect(parseTemplateVariables(undefined)).toEqual([]);
  });

  test('ignores single braces and unclosed patterns', () => {
    expect(parseTemplateVariables('{not a var} and {{unclosed')).toEqual([]);
  });

  test('ignores empty braces', () => {
    expect(parseTemplateVariables('{{}} and {{ }}')).toEqual([]);
  });
});

describe('variableHandles', () => {
  const spec = {
    type: 'text',
    handles: [{ id: 'output', kind: 'source', side: 'right', dataType: 'string' }],
    dynamicHandles: { handleKind: 'target', dataType: 'any', side: 'left' },
  };

  test('produces one target handle per parsed variable', () => {
    const handles = variableHandles(['username', 'task'], spec.dynamicHandles);
    expect(handles).toHaveLength(2);
    expect(handles[0]).toMatchObject({
      id: 'var-username',
      kind: 'target',
      side: 'left',
      dataType: 'any',
      label: 'username',
    });
  });

  test('stacks handles with evenly distributed vertical offsets', () => {
    const handles = variableHandles(['a', 'b'], spec.dynamicHandles);
    expect(handles[0].offset).toBeDefined();
    expect(handles[1].offset).toBeDefined();
    expect(handles[0].offset).not.toEqual(handles[1].offset);
  });

  test('returns an empty array when there are no variables', () => {
    expect(variableHandles([], spec.dynamicHandles)).toEqual([]);
  });
});
