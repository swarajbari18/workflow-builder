/**
 * Command palette tests.
 *
 * Covers: renders when paletteOpen is true, filters node list by search text,
 * filters by sourceDataType when paletteFilter is set, keyboard navigation,
 * selecting a node adds it to the canvas and closes the palette.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { CommandPalette } from './command-palette';
import { useStore } from '../store';
import { NODE_SPECS } from '../nodes/nodeSpecs';

beforeEach(() => {
  useStore.setState({
    nodes: [],
    edges: [],
    nodeIDs: {},
    rfInstance: null,
    paletteOpen: false,
    paletteFilter: null,
    paletteDropPos: null,
  });
});

test('palette is not rendered when paletteOpen is false', () => {
  render(<CommandPalette />);
  expect(screen.queryByTestId('command-palette')).not.toBeInTheDocument();
});

test('palette renders when paletteOpen is true', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  expect(screen.getByTestId('command-palette')).toBeInTheDocument();
});

test('palette shows all node types when no filter', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  Object.values(NODE_SPECS).forEach((spec) => {
    expect(screen.getByTestId(`palette-item-${spec.type}`)).toBeInTheDocument();
  });
});

test('typing in search box filters the node list by title', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  fireEvent.change(screen.getByTestId('palette-search'), { target: { value: 'llm' } });
  expect(screen.getByTestId('palette-item-llm')).toBeInTheDocument();
  // Items that don't match should be gone
  expect(screen.queryByTestId('palette-item-customInput')).not.toBeInTheDocument();
});

test('typing in search box filters by category name', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  fireEvent.change(screen.getByTestId('palette-search'), { target: { value: 'trigger' } });
  // Webhook Trigger, Schedule Trigger are in 'triggers' category or have 'trigger' in name
  expect(screen.getByTestId('palette-item-webhook')).toBeInTheDocument();
});

test('paletteFilter narrows list to nodes with a compatible input handle', () => {
  useStore.setState({ paletteOpen: true, paletteFilter: { sourceDataType: 'string' } });
  render(<CommandPalette />);
  // LLM has string target handles — should appear
  expect(screen.getByTestId('palette-item-llm')).toBeInTheDocument();
  // Webhook has no string inputs — should not appear
  expect(screen.queryByTestId('palette-item-webhook')).not.toBeInTheDocument();
});

test('title changes to "Connect to..." when paletteFilter is set', () => {
  useStore.setState({ paletteOpen: true, paletteFilter: { sourceDataType: 'string' } });
  render(<CommandPalette />);
  expect(screen.getByTestId('palette-title')).toHaveTextContent('Connect to…');
});

test('title is "Add node" when no filter', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  expect(screen.getByTestId('palette-title')).toHaveTextContent('Add node');
});

test('pressing Escape closes the palette', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  fireEvent.keyDown(screen.getByTestId('command-palette'), { key: 'Escape' });
  expect(useStore.getState().paletteOpen).toBe(false);
});

test('clicking a palette item calls addNode and closes the palette', () => {
  const mockAddNode = jest.fn();
  const mockGetNodeID = jest.fn(() => 'llm-1');
  const mockClosePalette = jest.fn();
  useStore.setState({
    paletteOpen: true,
    addNode: mockAddNode,
    getNodeID: mockGetNodeID,
    closePalette: mockClosePalette,
  });

  render(<CommandPalette />);
  fireEvent.click(screen.getByTestId('palette-item-llm'));

  expect(mockGetNodeID).toHaveBeenCalledWith('llm');
  expect(mockAddNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'llm-1', type: 'llm' }),
  );
  expect(mockClosePalette).toHaveBeenCalled();
});

test('ArrowDown moves selection to next item', () => {
  useStore.setState({ paletteOpen: true });
  render(<CommandPalette />);
  const palette = screen.getByTestId('command-palette');
  fireEvent.keyDown(palette, { key: 'ArrowDown' });
  // Second item should be selected (aria-selected)
  const items = screen.getAllByTestId(/palette-item-/);
  expect(items[1]).toHaveAttribute('aria-selected', 'true');
});

test('Enter on selected item adds the node', () => {
  const mockAddNode = jest.fn();
  const mockGetNodeID = jest.fn(() => 'text-1');
  const mockClosePalette = jest.fn();
  useStore.setState({
    paletteOpen: true,
    addNode: mockAddNode,
    getNodeID: mockGetNodeID,
    closePalette: mockClosePalette,
  });

  render(<CommandPalette />);
  const palette = screen.getByTestId('command-palette');
  // First item is already selected by default; press Enter
  fireEvent.keyDown(palette, { key: 'Enter' });

  expect(mockAddNode).toHaveBeenCalled();
  expect(mockClosePalette).toHaveBeenCalled();
});
