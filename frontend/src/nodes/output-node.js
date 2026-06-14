/**
 * OutputNode — the display terminal. Reads the live run value from nodeOutputCache
 * so streaming LLM tokens appear in real time on the canvas during a run.
 * Falls back to data.value for backwards-compat (test mode / static display).
 */
import { useStore } from '../store';
import { BaseNode } from './baseNode';
import { ValueDisplay } from '../canvas/value-display';

const bodyStyle = {
  margin: '0 10px 10px 10px',
  padding: 10,
  background: 'rgba(0,0,0,0.30)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 10,
  maxHeight: 200,
  overflow: 'auto',
};

export function OutputNode(props) {
  const { id, data } = props;
  // nodeOutputCache is keyed by node id — check for the upstream node that feeds us.
  // The OutputExecutor stores the display value in the OUTPUT node's own cache slot,
  // but it also comes through as node_output event directly on this node's cache.
  const cached = useStore((s) => s.nodeOutputCache[id]);
  const liveValue = cached?.streamingText ?? cached?.output ?? data.value;
  const liveType = cached?.dataType ?? data.valueType ?? data.outputType;

  return (
    <BaseNode {...props}>
      <div style={bodyStyle} data-testid="output-display">
        <ValueDisplay value={liveValue} dataType={liveType} />
      </div>
    </BaseNode>
  );
}
