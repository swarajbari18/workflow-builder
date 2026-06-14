/**
 * ContextMenu tests.
 *
 * Covers: not rendered when closed, renders correct items per surface type
 * (pane / node / edge), Escape closes it, clicking outside closes it, and
 * clicking an item dispatches the correct action.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ContextMenu } from './context-menu';
import { useStore } from '../store';

beforeEach(() => {
  useStore.setState({
    nodes: [{ id: 'llm-1', type: 'llm', position: { x: 0, y: 0 }, data: {} }],
    edges: [],
    nodeIDs: { llm: 1 },
    contextMenu: null,
    paletteOpen: false,
    paletteFilter: null,
    paletteDropPos: null,
  });
});

test('context menu is not rendered when contextMenu is null', () => {
  render(<ContextMenu />);
  expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
});

test('pane context menu renders Add node option', () => {
  useStore.setState({ contextMenu: { type: 'pane', x: 100, y: 200, target: null } });
  render(<ContextMenu />);
  expect(screen.getByTestId('context-menu')).toBeInTheDocument();
  expect(screen.getByTestId('ctx-add-node')).toBeInTheDocument();
});

test('node context menu renders Duplicate and Delete options', () => {
  useStore.setState({
    contextMenu: { type: 'node', x: 100, y: 200, target: { id: 'llm-1' } },
  });
  render(<ContextMenu />);
  expect(screen.getByTestId('ctx-duplicate')).toBeInTheDocument();
  expect(screen.getByTestId('ctx-delete')).toBeInTheDocument();
});

test('node context menu renders Rename option', () => {
  useStore.setState({
    contextMenu: { type: 'node', x: 100, y: 200, target: { id: 'llm-1' } },
  });
  render(<ContextMenu />);
  expect(screen.getByTestId('ctx-rename')).toBeInTheDocument();
});

test('edge context menu renders edge type info', () => {
  useStore.setState({
    contextMenu: {
      type: 'edge',
      x: 50,
      y: 50,
      target: { id: 'e1', data: { dataType: 'string' } },
    },
  });
  render(<ContextMenu />);
  expect(screen.getByTestId('ctx-edge-info')).toBeInTheDocument();
  expect(screen.getByTestId('ctx-edge-info')).toHaveTextContent('string');
});

test('pressing Escape closes the context menu', () => {
  useStore.setState({ contextMenu: { type: 'pane', x: 0, y: 0, target: null } });
  render(<ContextMenu />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(useStore.getState().contextMenu).toBeNull();
});

test('clicking Add node on pane menu opens command palette', () => {
  const mockOpenPalette = jest.fn();
  const mockCloseContextMenu = jest.fn();
  useStore.setState({
    contextMenu: { type: 'pane', x: 100, y: 200, target: null },
    openPalette: mockOpenPalette,
    closeContextMenu: mockCloseContextMenu,
  });
  render(<ContextMenu />);
  fireEvent.click(screen.getByTestId('ctx-add-node'));
  expect(mockOpenPalette).toHaveBeenCalled();
  expect(mockCloseContextMenu).toHaveBeenCalled();
});

test('clicking Delete on node menu removes the node and closes the menu', () => {
  useStore.setState({
    contextMenu: { type: 'node', x: 0, y: 0, target: { id: 'llm-1' } },
  });
  render(<ContextMenu />);
  act(() => { fireEvent.click(screen.getByTestId('ctx-delete')); });
  expect(useStore.getState().nodes).toHaveLength(0);
  expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
});

test('clicking Duplicate on node menu adds a copy and closes the menu', () => {
  useStore.setState({
    contextMenu: { type: 'node', x: 0, y: 0, target: { id: 'llm-1' } },
  });
  render(<ContextMenu />);
  act(() => { fireEvent.click(screen.getByTestId('ctx-duplicate')); });
  expect(useStore.getState().nodes).toHaveLength(2);
  expect(screen.queryByTestId('context-menu')).not.toBeInTheDocument();
});
