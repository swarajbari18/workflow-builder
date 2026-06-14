/**
 * WebhookNode — custom renderer for the Webhook Trigger node.
 *
 * This is the most interactive node in the pipeline builder because it is the
 * primary data ingress point. The user needs to understand what data is coming in
 * and choose exactly which pieces to route into their pipeline — without ever seeing
 * a key name with underscores or writing `payload.customer_name`.
 *
 * UI states:
 *   1. Waiting — no test event has arrived yet. Shows the webhook URL + "Add field manually".
 *   2. Live preview — a test event arrived (stored in data.receivedPayload). Shows all keys
 *      with their values and a "Use this →" button per key.
 *   3. Fields configured — at least one field is in data.payloadFields. Shows the active
 *      field list with remove buttons, plus the payload preview if available.
 *
 * Data flow:
 *   data.payloadFields = [{key: 'customer_name', label: 'customer name', dataType: 'string'}, ...]
 *   Each entry becomes one source handle (id = key, label = label).
 *   data.receivedPayload = {customer_name: 'Alice', price: 29.99, ...}  — display only.
 *
 * Multi-target confirmation:
 *   The `payload` handle AND each field handle are standard React Flow source handles.
 *   React Flow allows unlimited outgoing connections from a source handle. The user can
 *   connect "customer name" to a Text template AND an Output node simultaneously.
 *   isConnectionValid() only blocks duplicate edges (same source→target pair). ✓
 */
import { useState } from 'react';
import { BaseNode } from './baseNode';
import { useStore } from '../store';

// Type labels shown in the "Add field" dropdown — plain English, no code jargon.
const TYPE_OPTIONS = [
  { value: 'string',  label: 'Text' },
  { value: 'number',  label: 'Number' },
  { value: 'boolean', label: 'True / False' },
  { value: 'json',    label: 'Object' },
  { value: 'array',   label: 'List' },
  { value: 'any',     label: 'Any type' },
];

/** Converts a raw key like 'customer_name' to a readable label 'customer name'. */
function keyToLabel(key) {
  return String(key).replace(/_/g, ' ').replace(/-/g, ' ');
}

/** Converts a value to a short preview string for the "Got your data!" list. */
function previewValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 40) + (JSON.stringify(value).length > 40 ? '…' : '');
  const str = String(value);
  return str.length > 40 ? str.slice(0, 40) + '…' : str;
}

/** Infer a sensible type label from a JavaScript value. */
function inferTypeFromValue(value) {
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number')  return 'number';
  if (Array.isArray(value))       return 'array';
  if (typeof value === 'object' && value !== null) return 'json';
  return 'string';
}

// ── Styles ──────────────────────────────────────────────────────────────────

const bodyStyle = {
  padding: '0 10px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

const sectionTitleStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 2,
};

const previewRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  gap: 8,
  cursor: 'default',
};

const previewKeyStyle = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.75)',
  fontWeight: 500,
  flex: '0 0 auto',
  maxWidth: 90,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const previewValStyle = {
  fontSize: 10,
  color: 'rgba(255,255,255,0.38)',
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  textAlign: 'right',
};

const useButtonStyle = (active) => ({
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  border: active ? '1px solid rgba(48,209,88,0.6)' : '1px solid rgba(255,255,255,0.18)',
  background: active ? 'rgba(48,209,88,0.15)' : 'transparent',
  color: active ? 'rgba(48,209,88,0.9)' : 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: 'all 120ms ease',
  flexShrink: 0,
});

const addFieldRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  marginTop: 4,
};

const addFieldInputStyle = {
  flex: 1,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  color: 'rgba(255,255,255,0.85)',
  outline: 'none',
  fontFamily: 'Inter, sans-serif',
};

const addButtonStyle = {
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(10,132,255,0.5)',
  background: 'rgba(10,132,255,0.15)',
  color: 'rgba(10,132,255,0.9)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  fontFamily: 'Inter, sans-serif',
};

const activeFieldStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '3px 8px',
  borderRadius: 6,
  background: 'rgba(48,209,88,0.08)',
  border: '1px solid rgba(48,209,88,0.2)',
};

const activeFieldLabelStyle = {
  fontSize: 11,
  color: 'rgba(48,209,88,0.9)',
  fontWeight: 500,
};

const removeButtonStyle = {
  fontSize: 10,
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  cursor: 'pointer',
  padding: '0 2px',
  lineHeight: 1,
};

const waitingStyle = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.38)',
  textAlign: 'center',
  padding: '8px 0 4px',
};

const pulseStyle = {
  display: 'inline-flex',
  gap: 4,
  alignItems: 'center',
};

// ── Component ────────────────────────────────────────────────────────────────

export function WebhookNode(props) {
  const { id, data, spec } = props;
  const updateNodeField = useStore((s) => s.updateNodeField);

  // Local state for the "Add field manually" form
  const [manualKey,  setManualKey]  = useState('');
  const [manualType, setManualType] = useState('string');
  const [showAdd,    setShowAdd]    = useState(false);

  // Parse stored data — payloadFields is stored as a JSON string in node.data
  // because the field system uses plain string values. We serialize/deserialize here.
  const receivedPayload = (() => {
    try { return data.receivedPayload ? JSON.parse(data.receivedPayload) : null; }
    catch { return null; }
  })();

  const payloadFields = (() => {
    try { return data.payloadFields ? JSON.parse(data.payloadFields) : []; }
    catch { return []; }
  })();

  /** Add a field from the received payload (the "Use this →" button). */
  function useField(key, value) {
    const alreadyAdded = payloadFields.some((f) => f.key === key);
    if (alreadyAdded) {
      // Toggle off
      const updated = payloadFields.filter((f) => f.key !== key);
      updateNodeField(id, 'payloadFields', JSON.stringify(updated));
      return;
    }
    const newField = {
      key,
      label: keyToLabel(key),
      dataType: inferTypeFromValue(value),
    };
    updateNodeField(id, 'payloadFields', JSON.stringify([...payloadFields, newField]));
  }

  /** Add a field manually (typed by the user). */
  function addManualField() {
    const raw = manualKey.trim();
    if (!raw) return;
    // Convert the human-typed label into a key (spaces → underscores, lowercase)
    const key = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key) return;
    if (payloadFields.some((f) => f.key === key)) return; // already added
    const newField = { key, label: raw, dataType: manualType };
    updateNodeField(id, 'payloadFields', JSON.stringify([...payloadFields, newField]));
    setManualKey('');
    setShowAdd(false);
  }

  /** Remove a field from the active list. */
  function removeField(key) {
    const updated = payloadFields.filter((f) => f.key !== key);
    updateNodeField(id, 'payloadFields', JSON.stringify(updated));
  }

  // Build the extra handles from payloadFields.
  // Each field gets a source handle on the right, positioned evenly below the
  // static `payload` (Everything) handle.
  const step = 100 / (payloadFields.length + 2); // +2: space above and below
  const extraHandles = payloadFields.map((field, i) => ({
    id: field.key,               // handle ID = the payload key → what get_input() resolves
    kind: 'source',
    side: 'right',
    dataType: field.dataType || 'any',
    label: field.label,          // human-readable label shown on the node
    offset: `${Math.round(step * (i + 2))}%`, // stacked below the payload handle
  }));

  // ── Render ──────────────────────────────────────────────────────────────
  const payloadKeys = receivedPayload ? Object.keys(receivedPayload) : [];

  return (
    <BaseNode {...props} extraHandles={extraHandles}>
      <div style={bodyStyle}>

        {/* ① Active fields — shown when the user has declared at least one */}
        {payloadFields.length > 0 && (
          <div>
            <div style={sectionTitleStyle}>Using these fields</div>
            {payloadFields.map((field) => (
              <div key={field.key} style={activeFieldStyle}>
                <span style={activeFieldLabelStyle}>● {field.label}</span>
                <button
                  style={removeButtonStyle}
                  onClick={() => removeField(field.key)}
                  title={`Remove "${field.label}" handle`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ② Received payload preview — shown if a test event has arrived */}
        {payloadKeys.length > 0 && (
          <div>
            <div style={sectionTitleStyle}>
              {payloadFields.length > 0 ? 'Add more fields' : 'Got your data — pick what to use'}
            </div>
            {payloadKeys.map((key) => {
              const isActive = payloadFields.some((f) => f.key === key);
              return (
                <div key={key} style={previewRowStyle}>
                  <span style={previewKeyStyle}>{keyToLabel(key)}</span>
                  <span style={previewValStyle}>{previewValue(receivedPayload[key])}</span>
                  <button style={useButtonStyle(isActive)} onClick={() => useField(key, receivedPayload[key])}>
                    {isActive ? '✓ Using' : 'Use →'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ③ Waiting state — no test event yet */}
        {payloadKeys.length === 0 && (
          <div style={waitingStyle}>
            <div style={pulseStyle}>
              <span>○</span><span>○</span><span>○</span>
            </div>
            <div style={{ marginTop: 4 }}>Waiting for a test event</div>
            <div style={{ fontSize: 10, marginTop: 2, color: 'rgba(255,255,255,0.25)' }}>
              Or add a field manually ↓
            </div>
          </div>
        )}

        {/* ④ Add field manually — always available */}
        {!showAdd ? (
          <button
            style={{ ...addButtonStyle, alignSelf: 'flex-start', fontSize: 10, padding: '3px 8px', marginTop: 2 }}
            onClick={() => setShowAdd(true)}
          >
            + Add field manually
          </button>
        ) : (
          <div>
            <div style={sectionTitleStyle}>Add a field</div>
            <div style={addFieldRowStyle}>
              <input
                style={addFieldInputStyle}
                placeholder="e.g. customer name"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualField()}
                autoFocus
              />
              <select
                style={{ ...addFieldInputStyle, flex: '0 0 auto', width: 80, padding: '4px 4px' }}
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button style={addButtonStyle} onClick={addManualField}>Add</button>
              <button
                style={{ ...removeButtonStyle, padding: '3px 6px', fontSize: 12 }}
                onClick={() => { setShowAdd(false); setManualKey(''); }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

      </div>
    </BaseNode>
  );
}
