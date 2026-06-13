/**
 * BaseNode — the one component that renders every node type from its `NodeSpec`.
 *
 * Architecture
 * ------------
 * A spec contributes three things and nothing else: a title, a list of fields,
 * and a list of handles. BaseNode renders all of them generically, reading each
 * field's live value from the node's `data` and writing edits back through the
 * shared store (so `data` is the single source of truth and edits survive
 * re-renders, save, and the eventual backend submit).
 *
 * Field rendering is split into small, self-describing pieces — `isFieldVisible`
 * (conditional fields), `FieldControl` (the input element for a `kind`), and
 * `NodeField` (the labelled row) — so the main component reads as a layout.
 */
import { useState } from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../store';

const NODE_STYLE = {
  position: 'relative',
  width: 220,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  background: '#ffffff',
  fontFamily: 'sans-serif',
  fontSize: 12,
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
};
const HEADER_STYLE = {
  padding: '6px 10px',
  fontWeight: 600,
  background: '#f8fafc',
  borderBottom: '1px solid #e2e8f0',
  borderTopLeftRadius: 8,
  borderTopRightRadius: 8,
};
const BODY_STYLE = { display: 'flex', flexDirection: 'column', padding: 10 };
const CONTROL_STYLE = { width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '2px 4px' };
const ADVANCED_TOGGLE_STYLE = {
  alignSelf: 'flex-start',
  background: 'none',
  border: 'none',
  padding: 0,
  marginTop: 2,
  color: '#64748b',
  fontSize: 11,
  cursor: 'pointer',
};

/**
 * Whether a field should be shown given the current values. A field with a
 * `showIf` constraint is visible only when every named sibling matches an allowed
 * value; siblings fall back to their declared default so conditional fields
 * resolve correctly before the user has touched anything.
 *
 * @param {import('./nodeSpecs').Field} field
 * @param {Object} data
 * @param {import('./nodeSpecs').Field[]} fields  Sibling fields (used for defaults).
 * @returns {boolean}
 */
export function isFieldVisible(field, data, fields) {
  if (!field.showIf) return true;
  return Object.entries(field.showIf).every(([siblingName, allowed]) => {
    const sibling = fields.find((candidate) => candidate.name === siblingName);
    const current = data[siblingName] ?? sibling?.default;
    return Array.isArray(allowed) ? allowed.includes(current) : current === allowed;
  });
}

/**
 * The input element appropriate to a field's `kind`. `onChange` is called with
 * the extracted value, never the DOM event.
 *
 * @param {{ field: import('./nodeSpecs').Field, value: *, onChange: (value: *) => void }} props
 */
function FieldControl({ field, value, onChange }) {
  switch (field.kind) {
    case 'select':
      return (
        <select style={CONTROL_STYLE} value={value} onChange={(event) => onChange(event.target.value)}>
          {field.options.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />;
    case 'number':
      return <input type="number" style={CONTROL_STYLE} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
    case 'textarea':
      return <textarea style={CONTROL_STYLE} rows={3} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
    default:
      return <input type="text" style={CONTROL_STYLE} value={value} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />;
  }
}

/**
 * A labelled field row.
 * @param {{ field: import('./nodeSpecs').Field, value: *, onChange: (value: *) => void }} props
 */
function NodeField({ field, value, onChange }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 }} title={field.info}>
      <span>{(field.label ?? field.name) + (field.required ? ' *' : '')}</span>
      <FieldControl field={field} value={value} onChange={onChange} />
    </label>
  );
}

/**
 * Renders a node from its spec. `id` and `data` are injected by React Flow;
 * `spec` is bound per type in `nodeRegistry.js`.
 *
 * @param {{ id: string, data: Object, spec: import('./nodeSpecs').NodeSpec }} props
 */
export const BaseNode = ({ id, data, spec }) => {
  const updateNodeField = useStore((state) => state.updateNodeField);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const visibleFields = spec.fields.filter((field) => isFieldVisible(field, data, spec.fields));
  const basicFields = visibleFields.filter((field) => !field.advanced);
  const advancedFields = visibleFields.filter((field) => field.advanced);

  const renderField = (field) => (
    <NodeField
      key={field.name}
      field={field}
      value={data[field.name] ?? field.default ?? ''}
      onChange={(value) => updateNodeField(id, field.name, value)}
    />
  );

  return (
    <div style={NODE_STYLE}>
      <div style={HEADER_STYLE}>{spec.title}</div>

      <div style={BODY_STYLE}>
        {basicFields.map(renderField)}

        {advancedFields.length > 0 && (
          <>
            <button type="button" style={ADVANCED_TOGGLE_STYLE} onClick={() => setShowAdvanced((open) => !open)}>
              {showAdvanced ? '▾ Advanced' : '▸ Advanced'}
            </button>
            {showAdvanced && advancedFields.map(renderField)}
          </>
        )}
      </div>

      {spec.handles.map((handle) => (
        <Handle
          key={handle.id}
          id={`${id}-${handle.id}`}
          type={handle.kind}
          position={handle.side === 'left' ? Position.Left : Position.Right}
          style={handle.offset ? { top: handle.offset } : undefined}
        />
      ))}
    </div>
  );
};
