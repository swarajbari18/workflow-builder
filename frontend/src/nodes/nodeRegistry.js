/**
 * Derives React Flow wiring from the node registry, so adding a node type is a
 * single edit to `nodeSpecs.js`: both the canvas (`nodeTypes`) and the toolbar
 * (`toolbarItems`) update automatically from the same source.
 */
import { BaseNode } from './baseNode';
import { NODE_SPECS } from './nodeSpecs';

/**
 * React Flow `nodeTypes`: every type renders through `BaseNode` pre-bound to its
 * spec. Built once at module load so the map keeps a stable identity across
 * renders — React Flow remounts every node if `nodeTypes` changes between renders.
 *
 * @type {Object<string, React.ComponentType>}
 */
export const nodeTypes = Object.fromEntries(
  Object.entries(NODE_SPECS).map(([type, spec]) => {
    const SpecNode = (props) => <BaseNode {...props} spec={spec} />;
    SpecNode.displayName = `Node(${type})`;
    return [type, SpecNode];
  }),
);

/**
 * Palette entries for the toolbar, in registry order.
 * @type {{ type: string, label: string }[]}
 */
export const toolbarItems = Object.values(NODE_SPECS).map(({ type, title }) => ({
  type,
  label: title,
}));
