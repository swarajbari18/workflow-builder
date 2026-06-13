/**
 * CommandPalette — the primary node discovery modal.
 *
 * Triggered by:
 *   1. Ctrl+K / Cmd+K (global keydown, wired in ui.js)
 *   2. Dropping a connection wire on empty canvas space (via store.openPalette)
 *
 * When opened from a wire drop, paletteFilter = { sourceDataType } limits the
 * list to nodes with at least one compatible target handle, and the title reads
 * "Connect to…" rather than "Add node".
 *
 * Material: Real Liquid Glass (backdrop-filter) — static, single instance.
 * Width: 480px. Keyboard navigable.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { NODE_SPECS, isCompatibleTypes } from '../nodes/nodeSpecs';
import { CATEGORY_COLORS, LIQUID_GLASS } from '../styles/design-tokens';

const storeSelector = (s) => ({
  paletteOpen:    s.paletteOpen,
  paletteFilter:  s.paletteFilter,
  paletteDropPos: s.paletteDropPos,
  rfInstance:     s.rfInstance,
  addNode:        s.addNode,
  getNodeID:      s.getNodeID,
  closePalette:   s.closePalette,
});

function nodeMatchesSearch(spec, query) {
  const q = query.toLowerCase();
  return (
    spec.title.toLowerCase().includes(q) ||
    spec.category.toLowerCase().includes(q) ||
    spec.type.toLowerCase().includes(q)
  );
}

function nodeAcceptsDataType(spec, sourceDataType) {
  return spec.handles.some(
    (h) => h.kind === 'target' && isCompatibleTypes(sourceDataType, h.dataType ?? 'any'),
  );
}

function filteredNodes(searchQuery, paletteFilter) {
  return Object.values(NODE_SPECS).filter((spec) => {
    if (searchQuery && !nodeMatchesSearch(spec, searchQuery)) return false;
    if (paletteFilter?.sourceDataType && !nodeAcceptsDataType(spec, paletteFilter.sourceDataType)) return false;
    return true;
  });
}

const overlayStyle = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: '15vh',
  background: 'rgba(0,0,0,0.45)',
};

const paletteStyle = {
  background:           LIQUID_GLASS.background,
  backdropFilter:       LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter: LIQUID_GLASS.backdropFilter,
  border:               `1px solid ${LIQUID_GLASS.borderDefault}`,
  borderTop:            `1px solid ${LIQUID_GLASS.borderTop}`,
  borderRadius:         LIQUID_GLASS.borderRadius,
  boxShadow:            `${LIQUID_GLASS.shadowOuter}, ${LIQUID_GLASS.shadowInner}`,
  width: 480,
  overflow: 'hidden',
  fontFamily: 'Inter, sans-serif',
};

const paletteHeaderStyle = {
  padding: '14px 16px 10px',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
};

const paletteTitleStyle = {
  color: 'rgba(255,255,255,0.45)',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  marginBottom: 8,
};

const searchStyle = {
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: 8,
  padding: '8px 12px',
  color: 'rgba(255,255,255,0.9)',
  fontSize: 14,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
};

const resultsStyle = {
  maxHeight: 360,
  overflowY: 'auto',
  padding: '6px 8px 8px',
};

const itemStyle = (isSelected, categoryId) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 10px',
  borderRadius: 8,
  cursor: 'pointer',
  background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
  transition: 'background 80ms',
});

const itemDotStyle = (categoryId) => ({
  width: 8,
  height: 8,
  borderRadius: 2,
  background: CATEGORY_COLORS[categoryId] ?? 'rgba(255,255,255,0.4)',
  flexShrink: 0,
});

const itemNameStyle = {
  color: 'rgba(255,255,255,0.9)',
  fontSize: 13,
  fontWeight: 600,
  flex: 1,
};

const itemCategoryStyle = {
  color: 'rgba(255,255,255,0.35)',
  fontSize: 11,
  textTransform: 'capitalize',
};

const emptyStyle = {
  padding: '20px 16px',
  color: 'rgba(255,255,255,0.35)',
  fontSize: 13,
  textAlign: 'center',
};

export function CommandPalette() {
  const {
    paletteOpen, paletteFilter, paletteDropPos,
    rfInstance, addNode, getNodeID, closePalette,
  } = useStore(storeSelector, shallow);

  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const searchRef = useRef(null);

  const items = filteredNodes(search, paletteFilter);

  // Reset search and selection when palette opens
  useEffect(() => {
    if (paletteOpen) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => searchRef.current?.focus(), 0);
    }
  }, [paletteOpen]);

  // Clamp selection when items change
  useEffect(() => {
    setSelectedIndex((i) => Math.min(i, Math.max(items.length - 1, 0)));
  }, [items.length]);

  const placeNode = useCallback(
    (spec) => {
      const id = getNodeID(spec.type);
      let position = paletteDropPos ?? { x: 400, y: 300 };
      if (!paletteDropPos && rfInstance) {
        const centre = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        position = rfInstance.screenToFlowPosition
          ? rfInstance.screenToFlowPosition(centre)
          : rfInstance.project(centre);
      }
      addNode({ id, type: spec.type, position, data: { id, nodeType: spec.type } });
      closePalette();
    },
    [addNode, getNodeID, rfInstance, paletteDropPos, closePalette],
  );

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape') {
        closePalette();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, items.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' && items[selectedIndex]) {
        placeNode(items[selectedIndex]);
      }
    },
    [closePalette, items, selectedIndex, placeNode],
  );

  if (!paletteOpen) return null;

  const title = paletteFilter ? 'Connect to…' : 'Add node';

  return (
    <div style={overlayStyle} onClick={closePalette}>
      <div
        data-testid="command-palette"
        style={paletteStyle}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        <div style={paletteHeaderStyle}>
          <div data-testid="palette-title" style={paletteTitleStyle}>
            {title}
          </div>
          <input
            ref={searchRef}
            data-testid="palette-search"
            style={searchStyle}
            placeholder="Search nodes…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelectedIndex(0);
            }}
          />
        </div>

        <div style={resultsStyle}>
          {items.length === 0 ? (
            <div style={emptyStyle}>No matching nodes</div>
          ) : (
            items.map((spec, idx) => (
              <div
                key={spec.type}
                data-testid={`palette-item-${spec.type}`}
                aria-selected={idx === selectedIndex}
                style={itemStyle(idx === selectedIndex, spec.category)}
                onClick={() => placeNode(spec)}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div style={itemDotStyle(spec.category)} />
                <span style={itemNameStyle}>{spec.title}</span>
                <span style={itemCategoryStyle}>{spec.category}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
