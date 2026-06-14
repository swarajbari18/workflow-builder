/**
 * Template variable parsing — the pure foundation of the Text node.
 *
 * The Text node is a prompt template: writing `{{username}}` in its content means
 * "inject the value wired into the username handle here". This module turns the
 * template string into the ordered list of variable names, and turns that list into
 * the dynamic target-handle specs the node renders. It is pure and React-free so the
 * behaviour can be proven before any component consumes it.
 */

const VARIABLE_PATTERN = /\{\{\s*(\w+)\s*\}\}/g;

/**
 * Extracts the variable names from a template string, in order of first appearance
 * and deduplicated. A variable is `{{name}}` where name is one or more word chars,
 * with optional surrounding whitespace.
 *
 * @param {string} content
 * @returns {string[]}
 */
export function parseTemplateVariables(content) {
  if (!content) return [];
  const seen = new Set();
  for (const match of content.matchAll(VARIABLE_PATTERN)) {
    seen.add(match[1]);
  }
  return [...seen];
}

/**
 * Builds the dynamic target-handle specs for a set of parsed variable names,
 * stacking them with evenly distributed vertical offsets down the node's side.
 *
 * @param {string[]} variableNames
 * @param {import('./nodeSpecs').NodeSpec['dynamicHandles']} dynamicHandles
 * @returns {import('./nodeSpecs').Handle[]}
 */
export function variableHandles(variableNames, dynamicHandles) {
  const { handleKind, dataType, side } = dynamicHandles;
  const step = 100 / (variableNames.length + 1);
  return variableNames.map((name, index) => ({
    id: `var-${name}`,
    kind: handleKind,
    side,
    dataType,
    label: name,
    offset: `${Math.round(step * (index + 1))}%`,
  }));
}
