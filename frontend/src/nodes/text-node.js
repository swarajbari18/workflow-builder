/**
 * TextNode — the prompt template. It is a BaseNode that grows one input handle per
 * `{{variable}}` in its content, so the data flow into the template is visible: an
 * unconnected variable shows as an unconnected handle, making the missing wire
 * impossible to miss. The content is edited in the inspector; handles re-derive on
 * every render from the current content.
 */
import { BaseNode } from './baseNode';
import { parseTemplateVariables, variableHandles } from './template-variables';

export function TextNode(props) {
  const { data, spec } = props;
  const variables = parseTemplateVariables(data.content);
  const extraHandles = variableHandles(variables, spec.dynamicHandles);
  return <BaseNode {...props} extraHandles={extraHandles} />;
}
