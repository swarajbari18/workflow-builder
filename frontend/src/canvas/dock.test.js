/**
 * Dock component tests.
 *
 * Covers: category buttons render, category tray opens on hover showing the
 * correct node cards for that category, and clicking a node card dispatches
 * addNode to the store.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { Dock } from './dock';
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

const EXPECTED_CATEGORIES = ['triggers', 'data', 'ai', 'control', 'integration', 'output'];

test('dock renders one button per category', () => {
  render(<Dock />);
  EXPECTED_CATEGORIES.forEach((cat) => {
    expect(screen.getByTestId(`dock-category-${cat}`)).toBeInTheDocument();
  });
});

test('dock renders Run, State, and Search buttons', () => {
  render(<Dock />);
  expect(screen.getByTestId('dock-run-btn')).toBeInTheDocument();
  expect(screen.getByTestId('dock-state-btn')).toBeInTheDocument();
  expect(screen.getByTestId('dock-search-btn')).toBeInTheDocument();
});

test('hovering a category button opens the tray for that category', () => {
  render(<Dock />);
  fireEvent.mouseEnter(screen.getByTestId('dock-category-ai'));
  expect(screen.getByTestId('dock-tray-ai')).toBeInTheDocument();
});

test('category tray shows all nodes in that category', () => {
  render(<Dock />);
  fireEvent.mouseEnter(screen.getByTestId('dock-category-triggers'));
  const tray = screen.getByTestId('dock-tray-triggers');
  const triggerNodes = Object.values(NODE_SPECS).filter((s) => s.category === 'triggers');
  triggerNodes.forEach((spec) => {
    expect(tray).toHaveTextContent(spec.title);
  });
});

test('leaving the category button area closes the tray', () => {
  render(<Dock />);
  const catBtn = screen.getByTestId('dock-category-ai');
  fireEvent.mouseEnter(catBtn);
  expect(screen.queryByTestId('dock-tray-ai')).toBeInTheDocument();
  fireEvent.mouseLeave(screen.getByTestId('dock-tray-ai'));
  expect(screen.queryByTestId('dock-tray-ai')).not.toBeInTheDocument();
});

test('clicking a node card in the tray calls addNode', () => {
  const mockAddNode = jest.fn();
  const mockGetNodeID = jest.fn(() => 'llm-1');
  useStore.setState({ addNode: mockAddNode, getNodeID: mockGetNodeID });

  render(<Dock />);
  fireEvent.mouseEnter(screen.getByTestId('dock-category-ai'));
  const llmCard = screen.getByTestId('dock-node-card-llm');
  fireEvent.click(llmCard);

  expect(mockGetNodeID).toHaveBeenCalledWith('llm');
  expect(mockAddNode).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'llm-1', type: 'llm' }),
  );
});

test('search button opens the command palette', () => {
  const mockOpenPalette = jest.fn();
  useStore.setState({ openPalette: mockOpenPalette });

  render(<Dock />);
  fireEvent.click(screen.getByTestId('dock-search-btn'));
  expect(mockOpenPalette).toHaveBeenCalled();
});
