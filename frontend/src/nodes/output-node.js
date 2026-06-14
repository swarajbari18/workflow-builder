/**
 * OutputNode — the display terminal. It is a BaseNode with an inline body that renders
 * the value it received on its last run via the shared ValueDisplay, so the user sees
 * their result right on the canvas. `data.value` is written by the execution engine in
 * a later phase; until then the node shows a placeholder, and accepts a value prop for
 * verification.
 */
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
  const { data } = props;
  return (
    <BaseNode {...props}>
      <div style={bodyStyle} data-testid="output-display">
        <ValueDisplay value={data.value} dataType={data.valueType ?? data.outputType} />
      </div>
    </BaseNode>
  );
}
