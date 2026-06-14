/**
 * SuspensionModal — appears centre-screen when a pipeline pauses at an Input node.
 *
 * Reads suspendedRun from the store. Shows the prompt text, a response textarea,
 * and a "Continue" button that calls resumeRun(value). Dismisses when the run
 * resumes or the user cancels (marks run as error).
 */
import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { LIQUID_GLASS } from '../styles/design-tokens';

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 4000,
  background: 'rgba(0,0,0,0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backdropFilter: 'blur(4px)',
};

const modalStyle = {
  width: 480,
  background: LIQUID_GLASS.background,
  backdropFilter: LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter: LIQUID_GLASS.backdropFilter,
  border: `1px solid ${LIQUID_GLASS.borderDefault}`,
  borderTop: `1px solid ${LIQUID_GLASS.borderTop}`,
  borderRadius: LIQUID_GLASS.borderRadius,
  boxShadow: `${LIQUID_GLASS.shadowOuter}, ${LIQUID_GLASS.shadowInner}`,
  padding: '24px 24px 20px',
  fontFamily: 'Inter, sans-serif',
};

const headerStyle = {
  fontSize: 14,
  fontWeight: 700,
  color: 'rgba(255,255,255,0.92)',
  marginBottom: 6,
};

const subheadStyle = {
  fontSize: 11,
  color: 'rgba(255,255,255,0.40)',
  marginBottom: 16,
  letterSpacing: '0.03em',
};

const promptStyle = {
  fontSize: 13,
  color: 'rgba(255,255,255,0.80)',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: '10px 12px',
  marginBottom: 16,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
};

const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: 'rgba(255,255,255,0.92)',
  fontFamily: 'Inter, sans-serif',
  resize: 'vertical',
  minHeight: 80,
  marginBottom: 16,
  outline: 'none',
};

const actionsStyle = {
  display: 'flex',
  gap: 8,
  justifyContent: 'flex-end',
};

const cancelBtnStyle = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  padding: '8px 14px',
  fontSize: 12,
  fontWeight: 600,
  color: 'rgba(255,255,255,0.50)',
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif',
};

const continueBtnStyle = (loading) => ({
  background: loading ? 'rgba(0,122,255,0.15)' : 'rgba(0,122,255,0.20)',
  border: '1px solid rgba(0,122,255,0.35)',
  borderRadius: 8,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 700,
  color: loading ? 'rgba(0,122,255,0.45)' : '#007AFF',
  cursor: loading ? 'wait' : 'pointer',
  fontFamily: 'Inter, sans-serif',
  transition: 'background 120ms, color 120ms',
});

const storeSelector = (s) => ({
  suspendedRun: s.suspendedRun,
  resumeRun:    s.resumeRun,
  runStatus:    s.runStatus,
});

export function SuspensionModal() {
  const { suspendedRun, resumeRun, runStatus } = useStore(storeSelector, shallow);
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  if (!suspendedRun || runStatus !== 'running') return null;

  const handleContinue = async () => {
    if (!value.trim()) return;
    setLoading(true);
    await resumeRun(value.trim());
    setLoading(false);
    setValue('');
  };

  const handleCancel = () => {
    useStore.setState({ suspendedRun: null, runStatus: 'idle', activeRunId: null });
  };

  return (
    <div style={overlayStyle} data-testid="suspension-modal">
      <div style={modalStyle}>
        <div style={headerStyle}>Pipeline paused — awaiting your input</div>
        <div style={subheadStyle}>
          The pipeline reached an Input node. Provide a response to continue.
        </div>

        {suspendedRun.prompt && (
          <div style={promptStyle}>{suspendedRun.prompt}</div>
        )}

        <textarea
          data-testid="suspension-input"
          style={textareaStyle}
          placeholder="Type your response…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleContinue();
          }}
          autoFocus
        />

        <div style={actionsStyle}>
          <button style={cancelBtnStyle} onClick={handleCancel}>
            Cancel
          </button>
          <button
            data-testid="suspension-continue-btn"
            style={continueBtnStyle(loading)}
            onClick={handleContinue}
            disabled={loading || !value.trim()}
          >
            {loading ? '◌ Resuming…' : 'Continue ▶'}
          </button>
        </div>
      </div>
    </div>
  );
}
