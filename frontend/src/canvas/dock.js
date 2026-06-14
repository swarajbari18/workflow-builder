/**
 * Dock — the macOS-style bottom bar for discovering and adding nodes.
 *
 * Discoverability: the dock is pinned open while the canvas is empty (a first-time user
 * must see how to add a node). Once the first node exists it switches to auto-hide —
 * sliding down to a thin strip and springing back when the cursor nears the bottom edge.
 *
 * Each category shows an icon AND a label (the Apple-dock pattern); hovering a category
 * opens a tray of node cards, each with a category-coloured icon tile, the node name, and
 * a one-line description. Real Liquid Glass material (static, single instance).
 */
import { useState, useCallback, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { NODE_SPECS } from '../nodes/nodeSpecs';
import { CATEGORY_COLORS, LIQUID_GLASS, ANIMATION } from '../styles/design-tokens';

const CATEGORIES = [
  { id: 'triggers',    label: 'Triggers',    icon: '⚡' },
  { id: 'data',        label: 'Data',        icon: '▤' },
  { id: 'ai',          label: 'AI',          icon: '✦' },
  { id: 'control',     label: 'Control',     icon: '⋔' },
  { id: 'integration', label: 'Integration', icon: '⇄' },
  { id: 'output',      label: 'Output',      icon: '▣' },
];

const CATEGORY_ICONS = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.icon]));

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
  script:       'Run a Python transform on your input — describe it, AI writes the code',
};

const storeSelector = (s) => ({
  addNode:      s.addNode,
  getNodeID:    s.getNodeID,
  rfInstance:   s.rfInstance,
  openPalette:  s.openPalette,
  nodeCount:    s.nodes.length,
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
  gap: 2,
  padding: '6px 10px',
  pointerEvents: 'all',
  userSelect: 'none',
  transition: `transform ${ANIMATION.dockRevealDurationMs}ms cubic-bezier(0.34,1.56,0.64,1)`,
};

const categoryBtnStyle = (isActive, categoryId) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  background: isActive ? `${CATEGORY_COLORS[categoryId]}22` : 'transparent',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  padding: '6px 10px',
  color: isActive ? CATEGORY_COLORS[categoryId] : 'rgba(255,255,255,0.80)',
  fontSize: 12.5,
  fontFamily: 'Inter, sans-serif',
  fontWeight: 600,
  transition: 'color 120ms, background 120ms',
  whiteSpace: 'nowrap',
});

const categoryIconStyle = (isActive, categoryId) => ({
  fontSize: 14,
  lineHeight: 1,
  color: isActive ? CATEGORY_COLORS[categoryId] : 'rgba(255,255,255,0.55)',
  transition: 'color 120ms',
});

const separatorStyle = {
  width: 1,
  height: 22,
  background: 'rgba(255,255,255,0.14)',
  margin: '0 6px',
};

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  padding: '6px 9px',
  color: 'rgba(255,255,255,0.82)',
  fontSize: 15,
  transition: 'color 120ms',
};

const trayStyle = {
  ...glassStyle,
  marginBottom: 6,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 264,
  pointerEvents: 'all',
};

const nodeCardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  background: 'transparent',
  border: 'none',
  borderRadius: 10,
  cursor: 'pointer',
  padding: '8px 8px',
  textAlign: 'left',
  transition: 'background 120ms',
  width: '100%',
};

const cardIconTileStyle = (categoryId) => ({
  flexShrink: 0,
  width: 30,
  height: 30,
  borderRadius: 8,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 15,
  background: `${CATEGORY_COLORS[categoryId]}26`,
  color: CATEGORY_COLORS[categoryId],
});

const nodeCardNameStyle = {
  color: 'rgba(255,255,255,0.95)',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
};

const nodeCardDescStyle = {
  color: 'rgba(255,255,255,0.62)',
  fontSize: 11,
  fontFamily: 'Inter, sans-serif',
  lineHeight: 1.4,
};

const hintStyle = {
  ...glassStyle,
  marginBottom: 6,
  padding: '6px 12px',
  pointerEvents: 'none',
  color: 'rgba(255,255,255,0.75)',
  fontSize: 12,
  fontFamily: 'Inter, sans-serif',
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
          style={nodeCardStyle}
          onClick={() => onNodeSelect(spec)}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span style={cardIconTileStyle(category)}>{CATEGORY_ICONS[category]}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={nodeCardNameStyle}>{spec.title}</span>
            <span style={nodeCardDescStyle}>{NODE_DESCRIPTIONS[spec.type] ?? ''}</span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function Dock() {
  const { addNode, getNodeID, rfInstance, openPalette, nodeCount } = useStore(storeSelector, shallow);
  const [activeCategory, setActiveCategory] = useState(null);
  const [dockVisible, setDockVisible] = useState(false);
  const hideTimeoutRef = useRef(null);

  // Pinned open while the canvas is empty so a first-time user can find the nodes.
  const pinned = nodeCount === 0;
  const visible = pinned || dockVisible;

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
      // Cascade each placement off canvas centre so successive nodes never stack.
      const cascade = (nodeCount % 8) * 36;
      let position = { x: 360 + cascade, y: 220 + cascade };
      if (rfInstance) {
        const viewportCentre = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        const centre = rfInstance.screenToFlowPosition
          ? rfInstance.screenToFlowPosition(viewportCentre)
          : rfInstance.project(viewportCentre);
        position = { x: centre.x - 110 + cascade, y: centre.y - 40 + cascade };
      }
      addNode({ id, type: spec.type, position, data: { id, nodeType: spec.type } });
      setActiveCategory(null);
    },
    [addNode, getNodeID, rfInstance, nodeCount],
  );

  const dockTranslate = visible
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

        {pinned && !activeCategory && (
          <div style={hintStyle}>Pick a category to add your first node ↓</div>
        )}

        <div data-testid="dock" style={dockBarStyle}>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              data-testid={`dock-category-${cat.id}`}
              style={categoryBtnStyle(activeCategory === cat.id, cat.id)}
              onMouseEnter={() => setActiveCategory(cat.id)}
            >
              <span style={categoryIconStyle(activeCategory === cat.id, cat.id)}>{cat.icon}</span>
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
