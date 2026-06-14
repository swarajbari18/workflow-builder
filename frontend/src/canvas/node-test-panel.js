/**
 * NodeTestPanel — inject mock inputs into a single node and see the result.
 *
 * Forward-looking: tests what WILL happen, not what happened in the last run.
 * Opens from right-click → "Test this node."
 *
 * Each target handle becomes a structured input field appropriate for its dataType.
 * The result is labelled "Test result — not saved to run state" to make the
 * distinction from a real run explicit.
 *
 * Positioned as a fixed panel on the left (to not conflict with the inspection card).
 */
import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { ValueDisplay } from './value-display';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { LIQUID_GLASS, DATA_TYPE_COLORS } from '../styles/design-tokens';

const panelStyle = {
  position: 'fixed',
  top: '50%',
  left: 12,
  transform: 'translateY(-50%)',
  width: 400,
  maxHeight: '80vh',
  overflowY: 'auto',
  zIndex: 1800,
  background: LIQUID_GLASS.background,
  backdropFilter: LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter: LIQUID_GLASS.backdropFilter,
  border: `1px solid ${LIQUID_GLASS.borderDefault}`,
  borderTop: `1px solid ${LIQUID_GLASS.borderTop}`,
  borderRadius: LIQUID_GLASS.borderRadius,
  boxShadow: `${LIQUID_GLASS.shadowOuter}, ${LIQUID_GLASS.shadowInner}`,
  fontFamily: 'Inter, sans-serif',
};

const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 14px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
};

const titleStyle = { fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.85)' };
const subTitleStyle = { fontSize: 10, color: 'rgba(255,255,255,0.40)', marginTop: 2 };

const closeBtn = {
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'rgba(255,255,255,0.40)', fontSize: 16, padding: '2px 4px',
};

const sectionStyle = { padding: '12px 14px' };

const sectionLabelStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 10,
};

const fieldLabelStyle = {
  fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
  marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5,
};

const typeDot = (color) => ({
  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
  background: color && color !== 'rainbow' ? color : '#8E8E93',
});

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, padding: '8px 10px',
  fontSize: 12, color: 'rgba(255,255,255,0.9)',
  fontFamily: 'Inter, sans-serif', resize: 'vertical',
};

const runBtnStyle = (loading) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  width: '100%', padding: '9px 0', marginTop: 4,
  background: loading ? 'rgba(0,122,255,0.2)' : 'rgba(0,122,255,0.15)',
  border: '1px solid rgba(0,122,255,0.3)', borderRadius: 8,
  color: loading ? 'rgba(0,122,255,0.5)' : '#007AFF',
  fontSize: 12, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
  fontFamily: 'Inter, sans-serif',
  transition: 'background 120ms, color 120ms',
});

const resultLabelStyle = {
  fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
  color: 'rgba(90,200,250,0.7)', marginBottom: 8, textTransform: 'uppercase',
};

const errorResultStyle = {
  fontSize: 12, color: '#FF3B30', background: 'rgba(255,59,48,0.08)',
  border: '1px solid rgba(255,59,48,0.2)', borderRadius: 8, padding: '8px 10px',
};

function MockInput({ handle, value, onChange }) {
  const handleChange = (v) => onChange(handle.id, v);

  if (handle.dataType === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value === 'true' || value === true}
          onChange={(e) => handleChange(e.target.checked)}
          data-testid={`mock-input-${handle.id}`}
        />
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
          {value === 'true' || value === true ? 'True' : 'False'}
        </span>
      </label>
    );
  }

  if (handle.dataType === 'number') {
    return (
      <input
        type="number"
        value={value ?? ''}
        onChange={(e) => handleChange(e.target.value)}
        style={inputStyle}
        data-testid={`mock-input-${handle.id}`}
      />
    );
  }

  // Default: textarea for string, json, array, message[], any
  return (
    <textarea
      rows={3}
      value={value ?? ''}
      onChange={(e) => handleChange(e.target.value)}
      style={inputStyle}
      placeholder={handle.dataType === 'json' ? '{"key": "value"}' : 'Enter value…'}
      data-testid={`mock-input-${handle.id}`}
    />
  );
}

const storeSelector = (s) => ({
  closeTestPanel: s.closeTestPanel,
  testPanelNodeId: s.testPanelNodeId,
  runNodeTest: s.runNodeTest,
  nodes: s.nodes,
});

export function NodeTestPanel() {
  const { closeTestPanel, testPanelNodeId, runNodeTest, nodes } =
    useStore(storeSelector, shallow);

  const [mockInputs, setMockInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const node = nodes.find((n) => n.id === testPanelNodeId);
  if (!node) return null;

  const spec = NODE_SPECS[node.type];
  const targetHandles = spec?.handles.filter((h) => h.kind === 'target') ?? [];
  const nodeTitle = node.data?.label || spec?.title || node.type;

  const handleMockChange = (handleId, value) => {
    setMockInputs((prev) => ({ ...prev, [handleId]: value }));
    setResult(null);
  };

  const handleRunTest = async () => {
    setLoading(true);
    setResult(null);

    // Parse JSON inputs before sending
    const parsed = {};
    for (const [handleId, value] of Object.entries(mockInputs)) {
      const handle = targetHandles.find((h) => h.id === handleId);
      if (handle?.dataType === 'json' || handle?.dataType === 'array') {
        try {
          parsed[handleId] = JSON.parse(value);
        } catch {
          setResult({ error: { message: `Invalid JSON for input "${handle.label ?? handleId}"` } });
          setLoading(false);
          return;
        }
      } else {
        parsed[handleId] = value;
      }
    }

    const out = await runNodeTest(testPanelNodeId, parsed);
    setResult(out);
    setLoading(false);
  };

  return (
    <div data-testid="node-test-panel" style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={titleStyle}>{nodeTitle}</div>
          <div style={subTitleStyle}>Test this node in isolation</div>
        </div>
        <button style={closeBtn} onClick={closeTestPanel} title="Close">×</button>
      </div>

      <div style={sectionStyle}>
        {targetHandles.length === 0 ? (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.40)', fontStyle: 'italic' }}>
            This node has no inputs to mock.
          </div>
        ) : (
          <>
            <div style={sectionLabelStyle}>Mock inputs</div>
            {targetHandles.map((handle) => {
              const color = DATA_TYPE_COLORS[handle.dataType];
              return (
                <div key={handle.id} style={{ marginBottom: 14 }}>
                  <div style={fieldLabelStyle}>
                    <span style={typeDot(color)} />
                    {handle.label ?? handle.id}
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      {handle.dataType}
                    </span>
                  </div>
                  <MockInput
                    handle={handle}
                    value={mockInputs[handle.id] ?? ''}
                    onChange={handleMockChange}
                  />
                </div>
              );
            })}
          </>
        )}

        <button
          data-testid="run-node-test-btn"
          style={runBtnStyle(loading)}
          onClick={handleRunTest}
          disabled={loading}
        >
          {loading ? '◌ Running…' : '▶ Run Node'}
        </button>
      </div>

      {result && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px' }}>
          <div style={resultLabelStyle}>Test result — not saved to run state</div>
          {result.error
            ? <div style={errorResultStyle}>{result.error.message ?? 'Unknown error'}</div>
            : <ValueDisplay value={result.output} dataType={result.dataType} />
          }
        </div>
      )}
    </div>
  );
}
