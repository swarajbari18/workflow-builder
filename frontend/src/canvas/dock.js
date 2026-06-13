/**
 * Dock — the macOS-style auto-hiding bottom bar that replaces the flat toolbar.
 *
 * Node discovery path: hover a category button → card tray expands upward with
 * all node types in that category → click a card → node added to canvas centre.
 *
 * Auto-hide: the dock slides down until only a 4px strip is visible. A sentinel
 * div at the bottom edge detects cursor proximity and springs the dock back up.
 * This is implemented via CSS transforms; see ANIMATION tokens for timing.
 *
 * The dock uses Real Liquid Glass material (backdrop-filter) because it is static
 * and only one instance exists — no per-frame GPU cost concern.
 */
import { useState, useCallback, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { CATEGORY_COLORS, LIQUID_GLASS, ANIMATION } from '../styles/design-tokens';

const CATEGORIES = [
  { id: 'triggers',    label: 'Triggers' },
  { id: 'data',        label: 'Data' },
  { id: 'ai',          label: 'AI' },
  { id: 'control',     label: 'Control' },
  { id: 'integration', label: 'Integration' },
  { id: 'output',      label: 'Output' },
];

// One-line descriptions for each node type, used in the category tray cards.
const NODE_DESCRIPTIONS = {
  customInput:  'Pipeline entry point — accepts text or file input',
  customOutput: 'Pipeline terminal — displays the final result',
  llm:          'Call a language model with a prompt',
  text:         'Template with {{variable}} injection from upstream nodes',
  loop:         'Repeat a subgraph for each item in a list',
  agent:        'Autonomous AI that can call tools to complete a task',
  webhook:      'Start a pipeline from an incoming HTTP request',
  cron:         'Start a pipeline on a scheduled time interval',
  condition:    'Branch the pipeline based on a condition',
  apiRequest:   'Make an HTTP request — exposes itself as an LLM tool',
  script:       'AI-generated code transform — runs in a sandbox',
};

const storeSelector = (s) => ({
  addNode:      s.addNode,
  getNodeID:    s.getNodeID,
  rfInstance:   s.rfInstance,
  openPalette:  s.openPalette,
});

const glassStyle = {
  background:               LIQUID_GLASS.background,
  backdropFilter:           LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter:     LIQUID_GLASS.backdropFilter,
  border:                   `1px solid ${LIQUID_GLASS.borderDefault}`,
  borderTop:                `1px solid ${LIQUID_GLASS.borderTop}`,
  borderRadius:             LIQUID_GLASS.borderRadius,
  boxShadow:                `${LIQUID_GLASS.shadowOuter}, ${LIQUID_GLASS.shadowInner}`,
};

const dockWrapStyle = {
  position: 'fixed',
  bottom: 0,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 1000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  pointerEvents: 'none',
};

const dockBarStyle = {
  ...glassStyle,
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 12px',
  pointerEvents: 'all',
  userSelect: 'none',
  transition: `transform ${ANIMATION.dockRevealDurationMs}ms cubic-bezier(0.34,1.56,0.64,1)`,
};

const categoryBtnStyle = (isActive, categoryId) => ({
  background: isActive ? `${CATEGORY_COLORS[categoryId]}22` : 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  padding: '6px 10px',
  color: isActive ? CATEGORY_COLORS[categoryId] : 'rgba(255,255,255,0.65)',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
  fontWeight: 500,
  transition: 'color 120ms, background 120ms',
  whiteSpace: 'nowrap',
});

const separatorStyle = {
  width: 1,
  height: 20,
  background: 'rgba(255,255,255,0.12)',
  margin: '0 8px',
};

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  padding: '6px 10px',
  color: 'rgba(255,255,255,0.65)',
  fontSize: 14,
  transition: 'color 120ms',
};

const trayStyle = {
  ...glassStyle,
  marginBottom: 6,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 240,
  pointerEvents: 'all',
};

const nodeCardStyle = (categoryId) => ({
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  padding: '8px 10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  textAlign: 'left',
  transition: 'background 120ms',
  width: '100%',
});

const nodeCardNameStyle = (categoryId) => ({
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
});

const nodeCardDescStyle = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 11,
  fontFamily: 'Inter, sans-serif',
  lineHeight: 1.4,
};

function CategoryTray({ category, onNodeSelect, onMouseLeave }) {
  const nodesInCategory = Object.values(NODE_SPECS).filter(
    (spec) => spec.category === category,
  );

  return (
    <div
      data-testid={`dock-tray-${category}`}
      style={trayStyle}
      onMouseLeave={onMouseLeave}
    >
      {nodesInCategory.map((spec) => (
        <button
          key={spec.type}
          data-testid={`dock-node-card-${spec.type}`}
          style={nodeCardStyle(category)}
          onClick={() => onNodeSelect(spec)}
        >
          <span
            style={{
              ...nodeCardNameStyle(category),
              color: CATEGORY_COLORS[category] ?? 'rgba(255,255,255,0.9)',
            }}
          >
            {spec.title}
          </span>
          <span style={nodeCardDescStyle}>
            {NODE_DESCRIPTIONS[spec.type] ?? ''}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Dock() {
  const { addNode, getNodeID, rfInstance, openPalette } = useStore(storeSelector, shallow);
  const [activeCategory, setActiveCategory] = useState(null);
  const [dockVisible, setDockVisible] = useState(false);
  const hideTimeoutRef = useRef(null);

  const showDock = useCallback(() => {
    clearTimeout(hideTimeoutRef.current);
    setDockVisible(true);
  }, []);

  const scheduleDockHide = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setDockVisible(false);
      setActiveCategory(null);
    }, ANIMATION.dockHideDelayMs);
  }, []);

  const handleNodeSelect = useCallback(
    (spec) => {
      const id = getNodeID(spec.type);
      // Place at canvas centre when no rfInstance, or convert viewport centre to flow coords.
      let position = { x: 400, y: 300 };
      if (rfInstance) {
        const viewportCentre = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        };
        position = rfInstance.screenToFlowPosition
          ? rfInstance.screenToFlowPosition(viewportCentre)
          : rfInstance.project(viewportCentre);
      }
      addNode({ id, type: spec.type, position, data: { id, nodeType: spec.type } });
      setActiveCategory(null);
    },
    [addNode, getNodeID, rfInstance],
  );

  const dockTranslate = dockVisible
    ? 'translateX(-50%) translateY(0)'
    : `translateX(-50%) translateY(calc(100% - 4px))`;

  return (
    <>
      {/* Sentinel strip that triggers dock reveal when cursor is near the bottom edge */}
      <div
        data-testid="dock-sentinel"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: 40,
          zIndex: 999,
          pointerEvents: 'all',
        }}
        onMouseEnter={showDock}
      />

      <div
        data-testid="dock-wrap"
        style={{ ...dockWrapStyle, transform: dockTranslate }}
        onMouseEnter={showDock}
        onMouseLeave={scheduleDockHide}
      >
        {activeCategory && (
          <CategoryTray
            category={activeCategory}
            onNodeSelect={handleNodeSelect}
            onMouseLeave={() => setActiveCategory(null)}
          />
        )}

        <div data-testid="dock" style={dockBarStyle}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              data-testid={`dock-category-${cat.id}`}
              style={categoryBtnStyle(activeCategory === cat.id, cat.id)}
              onMouseEnter={() => setActiveCategory(cat.id)}
            >
              {cat.label}
            </button>
          ))}

          <div style={separatorStyle} />

          <button data-testid="dock-run-btn" style={iconBtnStyle} title="Run pipeline">
            ▶
          </button>
          <button data-testid="dock-state-btn" style={iconBtnStyle} title="Global state">
            ◉
          </button>
          <button
            data-testid="dock-search-btn"
            style={iconBtnStyle}
            title="Search nodes (Ctrl+K)"
            onClick={() => openPalette()}
          >
            ⌕
          </button>
        </div>
      </div>
    </>
  );
}
