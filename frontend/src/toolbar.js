/**
 * PipelineToolbar — the palette of draggable node types.
 *
 * The palette is generated from the node registry, so every node defined in
 * `nodeSpecs.js` appears here automatically without manual edits.
 */
import { DraggableNode } from './draggableNode';
import { toolbarItems } from './nodes/nodeRegistry';

export const PipelineToolbar = () => (
  <div style={{ padding: 10 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {toolbarItems.map(({ type, label }) => (
        <DraggableNode key={type} type={type} label={label} />
      ))}
    </div>
  </div>
);
