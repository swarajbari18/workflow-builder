/**
 * ContextMenu — a single absolute-positioned Liquid Glass menu rendered for
 * right-click events on four surfaces: canvas pane, node, edge, and handle.
 *
 * Only one menu is open at a time (enforced by the store). Closes on Escape
 * keydown (attached to document) or when the store's contextMenu becomes null.
 *
 * Surface → items mapping:
 *   pane   — Add node (opens command palette at cursor position)
 *   node   — Rename, Duplicate, Delete
 *   edge   — Type badge + last value from run (read-only info)
 *   handle — "What can connect here?" list of compatible node types (Phase 4+)
 */
import { useEffect, useCallback } from 'react';
import { shallow } from 'zustand/shallow';
import { useStore } from '../store';
import { DATA_TYPE_COLORS, LIQUID_GLASS } from '../styles/design-tokens';

const storeSelector = (s) => ({
  contextMenu:      s.contextMenu,
  closeContextMenu: s.closeContextMenu,
  openPalette:      s.openPalette,
});

const menuStyle = (x, y) => ({
  position: 'fixed',
  top: y,
  left: x,
  zIndex: 3000,
  minWidth: 180,
  background:           LIQUID_GLASS.background,
  backdropFilter:       LIQUID_GLASS.backdropFilter,
  WebkitBackdropFilter: LIQUID_GLASS.backdropFilter,
  border:               `1px solid ${LIQUID_GLASS.borderDefault}`,
  borderTop:            `1px solid ${LIQUID_GLASS.borderTop}`,
  borderRadius:         LIQUID_GLASS.borderRadius,
  boxShadow:            `${LIQUID_GLASS.shadowOuter}, ${LIQUID_GLASS.shadowInner}`,
  padding: '6px 0',
  fontFamily: 'Inter, sans-serif',
  userSelect: 'none',
});

const menuItemStyle = {
  display: 'block',
  width: '100%',
  padding: '7px 14px',
  background: 'transparent',
  border: 'none',
  textAlign: 'left',
  color: 'rgba(255,255,255,0.85)',
  fontSize: 13,
  cursor: 'pointer',
  transition: 'background 80ms',
};

const menuSeparatorStyle = {
  height: 1,
  background: 'rgba(255,255,255,0.08)',
  margin: '4px 0',
};

const destructiveItemStyle = {
  ...menuItemStyle,
  color: '#FF3B30',
};

const edgeInfoStyle = {
  padding: '8px 14px',
  color: 'rgba(255,255,255,0.45)',
  fontSize: 12,
};

const typeBadgeStyle = (color) => ({
  display: 'inline-block',
  padding: '2px 6px',
  borderRadius: 4,
  background: color ? `${color}22` : 'rgba(255,255,255,0.08)',
  border: `1px solid ${color ?? 'rgba(255,255,255,0.15)'}`,
  color: color ?? 'rgba(255,255,255,0.6)',
  fontSize: 11,
  fontWeight: 600,
  marginBottom: 4,
});

function MenuItem({ testId, style = menuItemStyle, onClick, children }) {
  return (
    <button
      data-testid={testId}
      style={style}
      onClick={onClick}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function PaneMenu({ closeContextMenu, openPalette, palettePos }) {
  return (
    <MenuItem
      testId="ctx-add-node"
      onClick={() => {
        openPalette(null, palettePos);
        closeContextMenu();
      }}
    >
      Add node…
    </MenuItem>
  );
}

function NodeMenu({ nodeId }) {
  return (
    <>
      <MenuItem
        testId="ctx-rename"
        onClick={() => useStore.setState({ contextMenu: null })}
      >
        Rename
      </MenuItem>
      <MenuItem
        testId="ctx-duplicate"
        onClick={() => {
          useStore.setState((s) => {
            const original = s.nodes.find((n) => n.id === nodeId);
            if (!original) return { contextMenu: null };
            const typeCount = (s.nodeIDs[original.type] ?? 0) + 1;
            const newId = `${original.type}-${typeCount}`;
            return {
              nodes: [
                ...s.nodes,
                {
                  ...original,
                  id: newId,
                  position: { x: original.position.x + 40, y: original.position.y + 40 },
                  data: { ...original.data, id: newId },
                  selected: false,
                },
              ],
              nodeIDs: { ...s.nodeIDs, [original.type]: typeCount },
              contextMenu: null,
            };
          });
        }}
      >
        Duplicate
      </MenuItem>
      <div style={menuSeparatorStyle} />
      <MenuItem
        testId="ctx-delete"
        style={destructiveItemStyle}
        onClick={() => {
          useStore.setState((s) => ({
            nodes: s.nodes.filter((n) => n.id !== nodeId),
            edges: s.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            contextMenu: null,
          }));
        }}
      >
        Delete
      </MenuItem>
    </>
  );
}

function EdgeMenu({ edge }) {
  const dataType = edge?.data?.dataType ?? 'any';
  const color = DATA_TYPE_COLORS[dataType];
  return (
    <div data-testid="ctx-edge-info" style={edgeInfoStyle}>
      <div style={typeBadgeStyle(color === 'rainbow' ? null : color)}>{dataType}</div>
      <div>Wire type — {dataType}</div>
    </div>
  );
}

export function ContextMenu() {
  const { contextMenu, closeContextMenu, openPalette } =
    useStore(storeSelector, shallow);

  const handleEscape = useCallback(
    (e) => {
      if (e.key === 'Escape') closeContextMenu();
    },
    [closeContextMenu],
  );

  useEffect(() => {
    if (!contextMenu) return;
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [contextMenu, handleEscape]);

  if (!contextMenu) return null;

  const { type, x, y, target } = contextMenu;

  return (
    <div data-testid="context-menu" style={menuStyle(x, y)}>
      {type === 'pane' && (
        <PaneMenu
          closeContextMenu={closeContextMenu}
          openPalette={openPalette}
          palettePos={target}
        />
      )}
      {type === 'node' && (
        <NodeMenu nodeId={target?.id} />
      )}
      {type === 'edge' && <EdgeMenu edge={target} />}
    </div>
  );
}
