/**
 * AiPanel — conversational code-gen panel for aiAssisted fields.
 *
 * Positioned left of the inspector (right: 352px) as a fixed floating panel.
 * Opens when the user clicks the ✦ spark button on any aiAssisted field.
 *
 * Explanation-first principle (DESIGN-VISION.md): the AI always shows its
 * reasoning before the code. Code is evidence, not the message. The "Use this"
 * button writes generatedCode and aiExplanation onto the node and closes the panel.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { LIQUID_GLASS } from '../styles/design-tokens';

const BACKEND_URL = 'http://localhost:8000';

const panelStyle = {
  position: 'fixed',
  top: 16,
  right: 352,
  bottom: 16,
  width: 320,
  zIndex: 1100,
  display: 'flex',
  flexDirection: 'column',
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
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  borderLeft: '3px solid #BF5AF2',
  borderTopLeftRadius: LIQUID_GLASS.borderRadius,
  flexShrink: 0,
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: 0,
};

const chatAreaStyle = {
  flex: 1,
  overflowY: 'auto',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
};

const inputRowStyle = {
  display: 'flex',
  gap: 8,
  padding: '12px 14px',
  borderTop: '1px solid rgba(255,255,255,0.08)',
  flexShrink: 0,
};

const textInputStyle = {
  flex: 1,
  background: 'rgba(0,0,0,0.30)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: 'rgba(255,255,255,0.95)',
  fontSize: 13,
  fontFamily: 'Inter, sans-serif',
  padding: '8px 10px',
  outline: 'none',
  resize: 'none',
};

const sendBtnStyle = {
  background: '#BF5AF2',
  border: 'none',
  borderRadius: 8,
  color: '#fff',
  cursor: 'pointer',
  fontSize: 16,
  padding: '0 14px',
  flexShrink: 0,
};

const codeBlockStyle = {
  background: 'rgba(0,0,0,0.4)',
  borderRadius: 8,
  padding: '10px 12px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 12,
  color: 'rgba(160,230,160,0.92)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  marginTop: 8,
  position: 'relative',
};

const useCodeBtnStyle = {
  display: 'block',
  width: '100%',
  marginTop: 8,
  background: 'rgba(191,90,242,0.15)',
  border: '1px solid rgba(191,90,242,0.4)',
  borderRadius: 8,
  color: '#BF5AF2',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  padding: '7px 0',
};

function AvatarDot({ role }) {
  return (
    <div
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: role === 'user' ? 'rgba(255,255,255,0.4)' : '#BF5AF2',
        flexShrink: 0,
        marginTop: 5,
      }}
    />
  );
}

function ChatMessage({ msg, onUseCode, nodeType }) {
  const isUser = msg.role === 'user';

  return (
    <div style={{ display: 'flex', gap: 8, flexDirection: isUser ? 'row-reverse' : 'row' }}>
      <AvatarDot role={msg.role} />
      <div style={{ flex: 1 }}>
        <div
          style={{
            color: isUser ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.95)',
            fontSize: 13,
            lineHeight: 1.5,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {isUser ? msg.content : _stripCode(msg.content)}
        </div>
        {!isUser && msg.generatedCode && (
          <>
            <pre style={codeBlockStyle}>{msg.generatedCode}</pre>
            <button style={useCodeBtnStyle} onClick={() => onUseCode(msg.generatedCode, msg.content)}>
              Use this ↑
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function _stripCode(text) {
  return text.replace(/```[\s\S]*?```/g, '').trim();
}

const selector = (s) => ({
  aiPanelKey: s.aiPanelKey,
  aiConversations: s.aiConversations,
  closeAiPanel: s.closeAiPanel,
  appendAiMessage: s.appendAiMessage,
  nodes: s.nodes,
  updateNodeField: s.updateNodeField,
});

export function AiPanel() {
  const {
    aiPanelKey,
    aiConversations,
    closeAiPanel,
    appendAiMessage,
    nodes,
    updateNodeField,
  } = useStore(selector, shallow);

  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  const key = aiPanelKey ? `${aiPanelKey.nodeId}/${aiPanelKey.fieldName}` : null;
  const messages = key ? (aiConversations[key] || []) : [];
  const node = aiPanelKey ? nodes.find((n) => n.id === aiPanelKey.nodeId) : null;

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    if (!draft.trim() || loading || !aiPanelKey) return;
    const text = draft.trim();
    setDraft('');
    appendAiMessage(aiPanelKey.nodeId, aiPanelKey.fieldName, { role: 'user', content: text });
    setLoading(true);

    const history = [
      ...(aiConversations[key] || []).map(({ role, content }) => ({ role, content })),
      { role: 'user', content: text },
    ];

    try {
      const resp = await fetch(`${BACKEND_URL}/ai/assist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodeType: node?.type ?? 'unknown',
          fieldName: aiPanelKey.fieldName,
          conversation: history,
          context: node?.data ?? {},
        }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const body = await resp.json();
      appendAiMessage(aiPanelKey.nodeId, aiPanelKey.fieldName, {
        role: 'assistant',
        content: body.message,
        generatedCode: body.generatedCode,
      });
    } catch (err) {
      appendAiMessage(aiPanelKey.nodeId, aiPanelKey.fieldName, {
        role: 'assistant',
        content: `Error: ${err.message}`,
      });
    } finally {
      setLoading(false);
    }
  }, [draft, loading, aiPanelKey, aiConversations, key, node, appendAiMessage]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const applyCode = useCallback((code, explanation) => {
    if (!aiPanelKey) return;
    updateNodeField(aiPanelKey.nodeId, 'generatedCode', code);
    updateNodeField(aiPanelKey.nodeId, 'aiExplanation', explanation);
    closeAiPanel();
  }, [aiPanelKey, updateNodeField, closeAiPanel]);

  if (!aiPanelKey) return null;

  const nodeLabel = node?.data?.label || node?.type || 'Node';

  return (
    <div data-testid="ai-panel" style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ color: 'rgba(255,255,255,0.95)', fontSize: 13, fontWeight: 600 }}>
          AI ✦&nbsp; {nodeLabel}
        </span>
        <button aria-label="Close AI panel" style={closeBtnStyle} onClick={closeAiPanel}>
          ×
        </button>
      </div>

      <div style={chatAreaStyle}>
        {messages.length === 0 && (
          <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', paddingTop: 24 }}>
            Describe what you want in plain English.
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            msg={msg}
            onUseCode={applyCode}
            nodeType={node?.type}
          />
        ))}
        {loading && (
          <div style={{ color: 'rgba(191,90,242,0.7)', fontSize: 12 }}>AI is thinking…</div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div style={inputRowStyle}>
        <textarea
          style={textInputStyle}
          rows={2}
          placeholder={messages.length === 0 ? 'Describe what you need…' : 'Refine…'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          style={{ ...sendBtnStyle, opacity: loading ? 0.5 : 1 }}
          onClick={sendMessage}
          disabled={loading}
          aria-label="Send"
        >
          ↑
        </button>
      </div>
    </div>
  );
}
