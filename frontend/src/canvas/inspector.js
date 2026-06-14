/**
 * Inspector — the floating panel where a node's configuration lives.
 *
 * Phase 2 deliberately removed all fields from the node face so the canvas shows
 * structure, not detail. The inspector is where that detail returns: it opens when a
 * node is selected (store.inspectorNodeId), renders that node's spec fields via
 * FieldControl, writes edits straight to the store, and closes on a pane click
 * (wired in ui.js) or its own close button.
 *
 * It is a Layer-4 floating panel (real Liquid Glass), pinned top-right as an overlay
 * so it never permanently eats canvas space — the explicit anti-sidebar stance in
 * DESIGN-VISION. Advanced fields are tucked behind a disclosure; showIf is honoured
 * via the shared isFieldVisible helper.
 *
 * Webhook nodes get two extra custom sections injected by WebhookUrlSection and
 * WebhookFieldsSection (webhook-node.js). Those sections sit outside the standard
 * FieldControl loop so they can own their own state and store interactions cleanly.
 */
import { useState } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { isFieldVisible } from '../nodes/baseNode';
import { FieldControl } from './field-control';
import { AiPanel } from './ai-panel';
import { WebhookUrlSection, WebhookFieldsSection } from '../nodes/webhook-node';
import { LIQUID_GLASS, CATEGORY_COLORS } from '../styles/design-tokens';

const selector = (s) => ({
  inspectorNodeId: s.inspectorNodeId,
  nodes: s.nodes,
  updateNodeField: s.updateNodeField,
  closeInspector: s.closeInspector,
  openAiPanel: s.openAiPanel,
  aiPanelKey: s.aiPanelKey,
});

const panelStyle = {
  position: 'fixed',
  top: 16,
  right: 16,
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

const headerStyle = (accent) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 16px',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  borderLeft: `3px solid ${accent}`,
  borderTopLeftRadius: LIQUID_GLASS.borderRadius,
});

const titleStyle = { color: 'rgba(255,255,255,0.95)', fontSize: 15, fontWeight: 600 };

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.55)',
  cursor: 'pointer',
  fontSize: 18,
  lineHeight: 1,
  padding: 0,
};

const bodyStyle = {
  padding: 16,
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  overflowY: 'auto',
};

const disclosureStyle = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.6)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  padding: '4px 0',
  textAlign: 'left',
};

export function Inspector() {
  const { inspectorNodeId, nodes, updateNodeField, closeInspector, openAiPanel, aiPanelKey } = useStore(selector, shallow);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const node = nodes.find((n) => n.id === inspectorNodeId);
  if (!node) return null;

  const spec = NODE_SPECS[node.type];
  if (!spec) return null;

  const isWebhook = node.type === 'webhook';
  const accent = CATEGORY_COLORS[spec.category] ?? 'rgba(255,255,255,0.15)';
  const valueOf = (field) => node.data[field.name] ?? field.default;

  // Skip internal fields — they are managed by custom node panel components, not FieldControl.
  const visible = spec.fields.filter(
    (field) => !field.internal && isFieldVisible(field, node.data, spec.fields),
  );
  const basic    = visible.filter((field) => !field.advanced);
  const advanced = visible.filter((field) => field.advanced);

  // Show the Advanced disclosure if there are standard advanced fields or a custom
  // advanced section (currently: webhook fields management panel).
  const hasAdvanced = advanced.length > 0 || isWebhook;

  const renderField = (field) => (
    <FieldControl
      key={field.name}
      field={field}
      value={valueOf(field)}
      onChange={(v) => updateNodeField(node.id, field.name, v)}
      onAiAssist={field.aiAssisted ? () => openAiPanel(node.id, field.name) : undefined}
    />
  );

  return (
    <>
    {aiPanelKey && aiPanelKey.nodeId === node.id && <AiPanel />}
    <div data-testid="inspector" style={panelStyle}>
      <div style={headerStyle(accent)}>
        <span style={titleStyle}>{node.data.label || spec.title}</span>
        <button aria-label="Close inspector" style={closeBtnStyle} onClick={closeInspector}>
          ×
        </button>
      </div>

      <div style={bodyStyle}>
        {/* Webhook: URL copy row always visible at the top */}
        {isWebhook && <WebhookUrlSection data={node.data} />}

        {/* Standard basic fields (path, method for webhook; all non-advanced for others) */}
        {basic.map(renderField)}

        {hasAdvanced && (
          <>
            <button
              style={disclosureStyle}
              onClick={() => setShowAdvanced((open) => !open)}
            >
              {showAdvanced ? '▾' : '▸'} Advanced
            </button>

            {showAdvanced && (
              <>
                {/* Standard advanced fields: testMode checkbox, samplePayload, secret */}
                {advanced.map(renderField)}

                {/* Webhook: field management panel (Got your data!, Add field manually) */}
                {isWebhook && (
                  <WebhookFieldsSection id={node.id} data={node.data} />
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
    </>
  );
}
