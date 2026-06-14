/**
 * Derives React Flow wiring from the node registry, so adding a node type is a
 * single edit to `nodeSpecs.js`: both the canvas (`nodeTypes`) and the toolbar
 * (`toolbarItems`) update automatically from the same source.
 */
import { BaseNode } from './baseNode';
import { OutputNode } from './output-node';
import { TextNode } from './text-node';
import { NODE_SPECS } from './nodeSpecs';

// A few node types need more than the generic card (an inline body or dynamic
// handles). They render through their own component, still spec-driven via BaseNode.
const CUSTOM_RENDERERS = {
  customOutput: OutputNode,
  text: TextNode,
};

/**
 * React Flow `nodeTypes`: each type renders through its custom component when one is
 * registered, otherwise the generic `BaseNode`, pre-bound to its spec. Built once at
 * module load so the map keeps a stable identity across renders — React Flow remounts
 * every node if `nodeTypes` changes between renders.
 *
 * @type {Object<string, React.ComponentType>}
 */
export const nodeTypes = Object.fromEntries(
  Object.entries(NODE_SPECS).map(([type, spec]) => {
    const Renderer = CUSTOM_RENDERERS[type] ?? BaseNode;
    const SpecNode = (props) => <Renderer {...props} spec={spec} />;
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
