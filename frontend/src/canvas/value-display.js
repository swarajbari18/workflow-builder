/**
 * ValueDisplay — renders any runtime value for a non-technical user.
 *
 * The product rule (DESIGN-VISION, Problem 8): the user never sees a raw JSON string.
 * A string is text, a number is a number, an object is an expandable set of key/value
 * rows, an array is a counted list, a conversation (message[]) is a chat view, a file
 * is a file card. This component is built generic on purpose — the Output node uses it
 * now, and the inspector and global-state panel reuse it in later phases.
 */
import { DATA_TYPE_COLORS } from '../styles/design-tokens';

const placeholderStyle = {
  color: 'rgba(255,255,255,0.40)',
  fontStyle: 'italic',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
};

const textStyle = {
  color: 'rgba(255,255,255,0.92)',
  fontSize: 13,
  lineHeight: 1.5,
  fontFamily: 'Inter, sans-serif',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

const scalarStyle = { ...textStyle, fontVariantNumeric: 'tabular-nums' };

const keyStyle = {
  color: 'rgba(255,255,255,0.55)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 2,
};

const countStyle = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 11,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 6,
};

const rowStyle = {
  borderLeft: '2px solid rgba(255,255,255,0.10)',
  paddingLeft: 10,
};

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

const isFileValue = (v, dataType) =>
  dataType === 'file' || (isPlainObject(v) && v.__file === true);

const isMessageArray = (v) =>
  Array.isArray(v) &&
  v.length > 0 &&
  v.every((item) => isPlainObject(item) && 'role' in item && 'content' in item);

function FileCard({ value }) {
  const kb = value.size ? `${(value.size / 1024).toFixed(1)} KB` : null;
  return (
    <div style={{ ...rowStyle, borderLeftColor: DATA_TYPE_COLORS.file }}>
      <div style={textStyle}>{value.name ?? 'file'}</div>
      {kb && <div style={countStyle}>{kb}</div>}
    </div>
  );
}

function MessageList({ messages }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {messages.map((msg, i) => (
        <div key={i} style={{ ...rowStyle, borderLeftColor: DATA_TYPE_COLORS['message[]'] }}>
          <div style={keyStyle}>{msg.role}</div>
          <div style={textStyle}>{msg.content}</div>
        </div>
      ))}
    </div>
  );
}

function ObjectTree({ value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {Object.entries(value).map(([key, val]) => (
        <div key={key} style={rowStyle}>
          <div style={keyStyle}>{key}</div>
          <ValueDisplay value={val} />
        </div>
      ))}
    </div>
  );
}

function ArrayList({ value }) {
  return (
    <div>
      <div style={countStyle}>{value.length} items</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.map((item, i) => (
          <div key={i} style={rowStyle}>
            <ValueDisplay value={item} />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ value: any, dataType?: string }} props
 */
export function ValueDisplay({ value, dataType }) {
  if (value === null || value === undefined || value === '') {
    return <span style={placeholderStyle}>No value yet.</span>;
  }
  if (isFileValue(value, dataType)) return <FileCard value={value} />;
  if (isMessageArray(value)) return <MessageList messages={value} />;
  if (Array.isArray(value)) return <ArrayList value={value} />;
  if (isPlainObject(value)) return <ObjectTree value={value} />;
  if (typeof value === 'boolean') return <span style={scalarStyle}>{value ? 'Yes' : 'No'}</span>;
  if (typeof value === 'number') return <span style={scalarStyle}>{String(value)}</span>;
  return <span style={textStyle}>{String(value)}</span>;
}
