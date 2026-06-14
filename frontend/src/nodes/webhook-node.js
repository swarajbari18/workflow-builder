import { useState } from 'react';
import { BaseNode } from './baseNode';
import { useStore } from '../store';

const TYPE_OPTIONS = [
  { value: 'string',  label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'boolean', label: 'True / False' },
  { value: 'json',    label: 'Object' },
  { value: 'array',   label: 'List' },
  { value: 'any',     label: 'Any type' },
];

function keyToLabel(key) {
  return String(key).replace(/_/g, ' ').replace(/-/g, ' ');
}

function previewValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return str.length > 34 ? str.slice(0, 34) + '…' : str;
}

function inferTypeFromValue(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')  return 'number';
  if (Array.isArray(value))       return 'array';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

const sectionLabelStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 5,
  fontFamily: 'Inter, sans-serif',
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 6,
  padding: '6px 10px',
};

const urlTextStyle = {
  flex: 1,
  fontSize: 11,
  color: 'rgba(175,82,222,0.9)',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
};

const ghostBtnStyle = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 2px',
  flexShrink: 0,
  fontSize: 12,
  color: 'rgba(255,255,255,0.4)',
  fontFamily: 'Inter, sans-serif',
};

const previewRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '5px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
};

const previewKeyStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.75)',
  fontWeight: 500,
  flexShrink: 0,
  maxWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const previewValStyle = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.38)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'right',
  minWidth: 0,
};

const toggleBtnStyle = (active) => ({
  fontSize: 11,
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: 999,
  border: active
    ? '1px solid rgba(48,209,88,0.6)'
    : '1px solid rgba(255,255,255,0.18)',
  background: active ? 'rgba(48,209,88,0.15)' : 'transparent',
  color: active ? 'rgba(48,209,88,0.9)' : 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  flexShrink: 0,
  transition: 'all 120ms ease',
  fontFamily: 'Inter, sans-serif',
});

const activeFieldRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '5px 8px',
  borderRadius: 6,
  background: 'rgba(48,209,88,0.08)',
  border: '1px solid rgba(48,209,88,0.2)',
};

const activeFieldLabelStyle = {
  fontSize: 12,
  color: 'rgba(48,209,88,0.9)',
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
};

const outlineInputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 7,
  color: 'rgba(255,255,255,0.92)',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
  padding: '6px 9px',
  outline: 'none',
};

const addBtnStyle = {
  fontSize: 12,
  fontWeight: 600,
  padding: '5px 12px',
  borderRadius: 7,
  border: '1px solid rgba(10,132,255,0.5)',
  background: 'rgba(10,132,255,0.15)',
  color: 'rgba(10,132,255,0.9)',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
  flexShrink: 0,
};

export function WebhookUrlSection({ data }) {
  const [copied, setCopied] = useState(false);
  const webhookUrl = `http://localhost:8000${data.path || '/webhook/new'}`;

  function handleCopy() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div>
      <div style={sectionLabelStyle}>Webhook URL</div>
      <div style={rowStyle}>
        <span style={urlTextStyle} title={webhookUrl}>{webhookUrl}</span>
        <button style={ghostBtnStyle} onClick={handleCopy} title="Copy URL">
          {copied ? '✓' : '⎘'}
        </button>
      </div>
    </div>
  );
}

export function WebhookFieldsSection({ id, data }) {
  const updateNodeField = useStore((s) => s.updateNodeField);

  const [showAddForm, setShowAddForm] = useState(false);
  const [manualKey,   setManualKey]   = useState('');
  const [manualType,  setManualType]  = useState('string');

  const receivedPayload = (() => {
    try { return data.receivedPayload ? JSON.parse(data.receivedPayload) : null; }
    catch { return null; }
  })();

  const payloadFields = (() => {
    try { return data.payloadFields ? JSON.parse(data.payloadFields) : []; }
    catch { return []; }
  })();

  const payloadKeys = receivedPayload ? Object.keys(receivedPayload) : [];

  function toggleField(key, value) {
    const exists = payloadFields.some((f) => f.key === key);
    const updated = exists
      ? payloadFields.filter((f) => f.key !== key)
      : [...payloadFields, { key, label: keyToLabel(key), dataType: inferTypeFromValue(value) }];
    updateNodeField(id, 'payloadFields', JSON.stringify(updated));
  }

  function removeField(key) {
    updateNodeField(id, 'payloadFields', JSON.stringify(payloadFields.filter((f) => f.key !== key)));
  }

  function commitAddField() {
    const raw = manualKey.trim();
    if (!raw) return;
    const key = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key || payloadFields.some((f) => f.key === key)) return;
    updateNodeField(id, 'payloadFields', JSON.stringify([
      ...payloadFields,
      { key, label: raw, dataType: manualType },
    ]));
    setManualKey('');
    setManualType('string');
    setShowAddForm(false);
  }

  function cancelAddField() {
    setManualKey('');
    setManualType('string');
    setShowAddForm(false);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {payloadFields.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={sectionLabelStyle}>Routing these fields</div>
          {payloadFields.map((field) => (
            <div key={field.key} style={activeFieldRowStyle}>
              <span style={activeFieldLabelStyle}>● {field.label}</span>
              <button
                style={{ ...ghostBtnStyle, fontSize: 14 }}
                onClick={() => removeField(field.key)}
                title="Remove handle"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {payloadKeys.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={sectionLabelStyle}>
            {payloadFields.length > 0 ? 'Add more fields' : 'Got your data — pick fields to route'}
          </div>
          {payloadKeys.map((key) => {
            const active = payloadFields.some((f) => f.key === key);
            return (
              <div key={key} style={previewRowStyle}>
                <span style={previewKeyStyle}>{keyToLabel(key)}</span>
                <span style={previewValStyle}>{previewValue(receivedPayload[key])}</span>
                <button
                  style={toggleBtnStyle(active)}
                  onClick={() => toggleField(key, receivedPayload[key])}
                >
                  {active ? '✓ Using' : 'Use →'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!showAddForm ? (
        <button
          style={{
            ...addBtnStyle,
            alignSelf: 'flex-start',
            fontSize: 11,
            padding: '4px 10px',
          }}
          onClick={() => setShowAddForm(true)}
        >
          + Add field manually
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={sectionLabelStyle}>Add a field</div>

          <input
            style={outlineInputStyle}
            placeholder="field name  (e.g. customer_name)"
            value={manualKey}
            onChange={(e) => setManualKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && commitAddField()}
            autoFocus
          />

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <select
              style={{ ...outlineInputStyle, width: 'auto', flex: '1 1 90px', padding: '5px 7px' }}
              value={manualType}
              onChange={(e) => setManualType(e.target.value)}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <button style={addBtnStyle} onClick={commitAddField}>Add</button>
            <button
              style={{ ...ghostBtnStyle, fontSize: 14, padding: '4px 6px' }}
              onClick={cancelAddField}
            >
              ✕
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

export function WebhookNode(props) {
  const { data } = props;

  const payloadFields = (() => {
    try { return data.payloadFields ? JSON.parse(data.payloadFields) : []; }
    catch { return []; }
  })();

  const step = 100 / (payloadFields.length + 2);
  const extraHandles = payloadFields.map((field, i) => ({
    id: field.key,
    kind: 'source',
    side: 'right',
    dataType: field.dataType || 'any',
    label: field.label,
    offset: `${Math.round(step * (i + 2))}%`,
  }));

  return <BaseNode {...props} extraHandles={extraHandles} />;
}
