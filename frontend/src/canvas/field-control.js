/**
 * FieldControl — renders one editable control for a single NodeSpec field, by kind.
 *
 * This is the inspector's building block. Each `field.kind` maps to one control:
 * text/number/textarea/select/checkbox are editable; `code` and `info` are read-only
 * displays (the user works in English, never edits generated code); `params` is a
 * structured row editor for API function parameters (no raw JSON).
 *
 * Controls are uncontrolled-of-the-store: they read `value` and report changes via
 * `onChange(newValue)`. The inspector owns the wiring to the store.
 */
import { useId } from 'react';

const labelStyle = {
  display: 'block',
  color: 'rgba(255,255,255,0.92)',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 6,
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(0,0,0,0.30)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.95)',
  fontSize: 13,
  fontFamily: 'Inter, sans-serif',
  padding: '8px 10px',
  outline: 'none',
};

const codeStyle = {
  ...inputStyle,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: 'rgba(160,230,160,0.92)',
  maxHeight: 220,
  overflow: 'auto',
};

const infoStyle = {
  color: 'rgba(255,255,255,0.70)',
  fontSize: 12,
  lineHeight: 1.5,
  fontFamily: 'Inter, sans-serif',
};

const placeholderStyle = { ...infoStyle, fontStyle: 'italic', color: 'rgba(255,255,255,0.40)' };

const PARAM_TYPES = ['string', 'number', 'boolean', 'json', 'array'];

function ParamsEditor({ rows, onChange }) {
  const list = Array.isArray(rows) ? rows : [];
  const update = (index, key, val) =>
    onChange(list.map((row, i) => (i === index ? { ...row, [key]: val } : row)));
  const addRow = () => onChange([...list, { name: '', type: 'string', description: '' }]);
  const removeRow = (index) => onChange(list.filter((_, i) => i !== index));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((row, index) => (
        <div key={index} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            aria-label={`Parameter ${index} name`}
            style={{ ...inputStyle, flex: 2 }}
            placeholder="name"
            value={row.name ?? ''}
            onChange={(e) => update(index, 'name', e.target.value)}
          />
          <select
            aria-label={`Parameter ${index} type`}
            style={{ ...inputStyle, flex: 1 }}
            value={row.type ?? 'string'}
            onChange={(e) => update(index, 'type', e.target.value)}
          >
            {PARAM_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input
            aria-label={`Parameter ${index} description`}
            style={{ ...inputStyle, flex: 3 }}
            placeholder="description"
            value={row.description ?? ''}
            onChange={(e) => update(index, 'description', e.target.value)}
          />
          <button
            type="button"
            aria-label={`Remove parameter ${row.name || index}`}
            onClick={() => removeRow(index)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              fontSize: 16,
              padding: '0 4px',
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        style={{
          alignSelf: 'flex-start',
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 8,
          color: 'rgba(255,255,255,0.85)',
          cursor: 'pointer',
          fontSize: 12,
          fontFamily: 'Inter, sans-serif',
          padding: '6px 10px',
        }}
      >
        + Add parameter
      </button>
    </div>
  );
}

/**
 * @param {{
 *   field: import('../nodes/nodeSpecs').Field,
 *   value: any,
 *   onChange: (value: any) => void,
 * }} props
 */
export function FieldControl({ field, value, onChange }) {
  const id = useId();

  if (field.kind === 'info') {
    return (
      <div>
        <span style={labelStyle}>{field.label ?? field.name}</span>
        {value ? (
          <div style={infoStyle}>{value}</div>
        ) : (
          <div style={placeholderStyle}>Nothing to explain yet.</div>
        )}
      </div>
    );
  }

  if (field.kind === 'code') {
    return (
      <div>
        <span style={labelStyle}>{field.label ?? field.name}</span>
        {value ? (
          <pre style={codeStyle}>{value}</pre>
        ) : (
          <div style={placeholderStyle}>No code generated yet — describe what you want above.</div>
        )}
      </div>
    );
  }

  if (field.kind === 'params') {
    return (
      <div>
        <span style={labelStyle}>{field.label ?? field.name}</span>
        <ParamsEditor rows={value} onChange={onChange} />
      </div>
    );
  }

  if (field.kind === 'checkbox') {
    return (
      <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }} htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          style={{ width: 16, height: 16, accentColor: '#007AFF' }}
        />
        {field.label ?? field.name}
      </label>
    );
  }

  return (
    <div>
      <label style={labelStyle} htmlFor={id}>{field.label ?? field.name}</label>
      {field.kind === 'textarea' ? (
        <textarea
          id={id}
          style={{ ...inputStyle, minHeight: 72, resize: 'vertical' }}
          placeholder={field.placeholder}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === 'select' ? (
        <select
          id={id}
          style={inputStyle}
          value={value ?? field.default ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={field.kind === 'number' ? 'number' : 'text'}
          style={inputStyle}
          placeholder={field.placeholder}
          value={value ?? ''}
          onChange={(e) =>
            onChange(field.kind === 'number' ? Number(e.target.value) : e.target.value)
          }
        />
      )}
    </div>
  );
}
