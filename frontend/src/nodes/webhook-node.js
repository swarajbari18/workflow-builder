/**
 * WebhookNode — custom renderer for the Webhook Trigger node.
 *
 * Three UI panels, shown together depending on state:
 *
 *   "Your webhook URL"
 *     Always shown. The URL the external system should POST to.
 *     One-click copy button.
 *
 *   "Try it out" (test panel)
 *     A small JSON textarea pre-filled with the last received payload or
 *     a starter template. The user edits the sample, clicks "▶ Run", and the
 *     full pipeline executes — no curl, no terminal.
 *
 *   "Got your data!" (field picker)
 *     Shown after a run completes. Each key of the received payload appears
 *     with its value and a "Use →" toggle. Toggling adds a source handle to
 *     the node so the user can wire that field to downstream nodes.
 *
 * Multi-target: each field handle is an ordinary React Flow source handle.
 * One field can fan out to many nodes — no extra code needed.
 */
import { useState } from 'react';
import { BaseNode } from './baseNode';
import { useStore } from '../store';

const BACKEND_URL = 'http://localhost:8000';

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
  return str.length > 38 ? str.slice(0, 38) + '…' : str;
}

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
  gap: 8,
};

const sectionTitleStyle = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 3,
};

const urlRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  background: 'rgba(255,255,255,0.04)',
  borderRadius: 6,
  padding: '4px 8px',
};

const urlTextStyle = {
  flex: 1,
  fontSize: 10,
  color: 'rgba(175,82,222,0.9)',
  fontFamily: 'monospace',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const copyBtnStyle = {
  fontSize: 10,
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer',
  padding: '0 2px',
  flexShrink: 0,
};

const testTextareaStyle = {
  width: '100%',
  minHeight: 70,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 10,
  color: 'rgba(255,255,255,0.82)',
  fontFamily: 'monospace',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
};

const runBtnStyle = (isRunning) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  padding: '5px 0',
  borderRadius: 7,
  border: isRunning
    ? '1px solid rgba(52,199,89,0.3)'
    : '1px solid rgba(175,82,222,0.5)',
  background: isRunning
    ? 'rgba(52,199,89,0.1)'
    : 'rgba(175,82,222,0.15)',
  color: isRunning ? 'rgba(52,199,89,0.8)' : 'rgba(175,82,222,0.9)',
  fontSize: 11,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  cursor: isRunning ? 'wait' : 'pointer',
  width: '100%',
  transition: 'all 150ms ease',
});

const errorPillStyle = {
  fontSize: 10,
  color: '#FF3B30',
  background: 'rgba(255,59,48,0.10)',
  border: '1px solid rgba(255,59,48,0.25)',
  borderRadius: 5,
  padding: '2px 6px',
};

const previewRowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '4px 8px',
  borderRadius: 6,
  background: 'rgba(255,255,255,0.04)',
  gap: 8,
};

const previewKeyStyle = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.75)',
  fontWeight: 500,
  flex: '0 0 auto',
  maxWidth: 80,
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
  padding: '2px 7px',
  borderRadius: 999,
  border: active ? '1px solid rgba(48,209,88,0.6)' : '1px solid rgba(255,255,255,0.18)',
  background: active ? 'rgba(48,209,88,0.15)' : 'transparent',
  color: active ? 'rgba(48,209,88,0.9)' : 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  transition: 'all 120ms ease',
});

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

const removeBtnStyle = {
  fontSize: 10,
  background: 'none',
  border: 'none',
  color: 'rgba(255,255,255,0.3)',
  cursor: 'pointer',
  padding: '0 2px',
};

const addFieldRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 5,
};

const inputStyle = {
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

const addBtnStyle = {
  fontSize: 11,
  fontWeight: 600,
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid rgba(10,132,255,0.5)',
  background: 'rgba(10,132,255,0.15)',
  color: 'rgba(10,132,255,0.9)',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

// ── Component ────────────────────────────────────────────────────────────────

export function WebhookNode(props) {
  const { id, data, spec } = props;
  const updateNodeField = useStore((s) => s.updateNodeField);
  const runPipeline     = useStore((s) => s.runPipeline);
  const runStatus       = useStore((s) => s.runStatus);

  const isRunning = runStatus === 'running';

  // Parse stored data
  const receivedPayload = (() => {
    try { return data.receivedPayload ? JSON.parse(data.receivedPayload) : null; }
    catch { return null; }
  })();

  const payloadFields = (() => {
    try { return data.payloadFields ? JSON.parse(data.payloadFields) : []; }
    catch { return []; }
  })();

  const webhookPath = data.path || '/webhook/new';
  const webhookUrl  = `${BACKEND_URL}${webhookPath}`;

  // Test panel state
  const defaultSample = receivedPayload
    ? JSON.stringify(receivedPayload, null, 2)
    : '{\n  "customer": "Alice",\n  "total": 99.90\n}';

  const [samplePayload,   setSamplePayload]   = useState(defaultSample);
  const [jsonError,       setJsonError]       = useState(null);
  const [copied,          setCopied]          = useState(false);
  const [showAdd,         setShowAdd]         = useState(false);
  const [manualKey,       setManualKey]       = useState('');
  const [manualType,      setManualType]      = useState('string');

  // ── Handlers ──────────────────────────────────────────────────────────────

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleRun() {
    setJsonError(null);
    let parsed;
    try {
      parsed = JSON.parse(samplePayload);
    } catch (e) {
      setJsonError('Invalid JSON — check your sample payload');
      return;
    }
    runPipeline(parsed);
  }

  function useField(key, value) {
    const alreadyAdded = payloadFields.some((f) => f.key === key);
    if (alreadyAdded) {
      const updated = payloadFields.filter((f) => f.key !== key);
      updateNodeField(id, 'payloadFields', JSON.stringify(updated));
    } else {
      const newField = { key, label: keyToLabel(key), dataType: inferTypeFromValue(value) };
      updateNodeField(id, 'payloadFields', JSON.stringify([...payloadFields, newField]));
    }
  }

  function removeField(key) {
    updateNodeField(id, 'payloadFields', JSON.stringify(payloadFields.filter((f) => f.key !== key)));
  }

  function addManualField() {
    const raw = manualKey.trim();
    if (!raw) return;
    const key = raw.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (!key || payloadFields.some((f) => f.key === key)) return;
    updateNodeField(id, 'payloadFields', JSON.stringify([...payloadFields, { key, label: raw, dataType: manualType }]));
    setManualKey('');
    setShowAdd(false);
  }

  // Extra handles from declared fields
  const step = 100 / (payloadFields.length + 2);
  const extraHandles = payloadFields.map((field, i) => ({
    id: field.key,
    kind: 'source',
    side: 'right',
    dataType: field.dataType || 'any',
    label: field.label,
    offset: `${Math.round(step * (i + 2))}%`,
  }));

  const payloadKeys = receivedPayload ? Object.keys(receivedPayload) : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <BaseNode {...props} extraHandles={extraHandles}>
      <div style={bodyStyle}>

        {/* ① Webhook URL — always visible, one-click copy */}
        <div>
          <div style={sectionTitleStyle}>Your webhook URL</div>
          <div style={urlRowStyle}>
            <span style={urlTextStyle}>{webhookUrl}</span>
            <button style={copyBtnStyle} onClick={copyUrl} title="Copy URL">
              {copied ? '✓' : '⎘'}
            </button>
          </div>
        </div>

        {/* ② Test panel — try the pipeline right here */}
        <div>
          <div style={sectionTitleStyle}>Try it out</div>
          <textarea
            style={testTextareaStyle}
            value={samplePayload}
            onChange={(e) => { setSamplePayload(e.target.value); setJsonError(null); }}
            spellCheck={false}
            placeholder={'{\n  "key": "value"\n}'}
          />
          {jsonError && <div style={errorPillStyle}>{jsonError}</div>}
          <button style={runBtnStyle(isRunning)} onClick={handleRun} disabled={isRunning}>
            {isRunning ? '◌  Running…' : '▶  Run pipeline with this data'}
          </button>
        </div>

        {/* ③ Active field handles */}
        {payloadFields.length > 0 && (
          <div>
            <div style={sectionTitleStyle}>Routing these fields</div>
            {payloadFields.map((field) => (
              <div key={field.key} style={activeFieldStyle}>
                <span style={activeFieldLabelStyle}>● {field.label}</span>
                <button style={removeBtnStyle} onClick={() => removeField(field.key)} title="Remove">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* ④ "Got your data!" preview after a run */}
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

        {/* ⑤ Add field manually */}
        {!showAdd ? (
          <button
            style={{ ...addBtnStyle, alignSelf: 'flex-start', fontSize: 10, padding: '3px 8px' }}
            onClick={() => setShowAdd(true)}
          >
            + Add field manually
          </button>
        ) : (
          <div>
            <div style={sectionTitleStyle}>Add a field</div>
            <div style={addFieldRowStyle}>
              <input
                style={inputStyle}
                placeholder="field name"
                value={manualKey}
                onChange={(e) => setManualKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addManualField()}
                autoFocus
              />
              <select
                style={{ ...inputStyle, flex: '0 0 auto', width: 76, padding: '4px 4px' }}
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button style={addBtnStyle} onClick={addManualField}>Add</button>
              <button style={{ ...removeBtnStyle, padding: '3px 6px', fontSize: 12 }}
                onClick={() => { setShowAdd(false); setManualKey(''); }}>✕</button>
            </div>
          </div>
        )}

      </div>
    </BaseNode>
  );
}
