/**
 * GhostWorkflow tests.
 *
 * Covers: visible on empty canvas, hidden when user has nodes, example nodes
 * rendered, clicking a ghost node promotes it to a real node and closes the ghost.
 */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GhostWorkflow } from './ghost-workflow';
import { useStore } from '../store';

beforeEach(() => {
  useStore.setState({
    nodes: [],
    edges: [],
    nodeIDs: {},
    contextMenu: null,
  });
});

test('ghost workflow is visible on an empty canvas', () => {
  render(<GhostWorkflow />);
  expect(screen.getByTestId('ghost-workflow')).toBeInTheDocument();
});

test('ghost workflow is not rendered when user has placed nodes', () => {
  useStore.setState({
    nodes: [{ id: 'llm-1', type: 'llm', position: { x: 0, y: 0 }, data: {} }],
  });
  render(<GhostWorkflow />);
  expect(screen.queryByTestId('ghost-workflow')).not.toBeInTheDocument();
});

test('ghost workflow renders at least three example node cards', () => {
  render(<GhostWorkflow />);
  expect(screen.getAllByTestId(/^ghost-node-/).length).toBeGreaterThanOrEqual(3);
});

test('clicking a ghost node promotes it to a real node in the store', () => {
  render(<GhostWorkflow />);
  const ghostNodes = screen.getAllByTestId(/^ghost-node-/);
  act(() => { fireEvent.click(ghostNodes[0]); });
  expect(useStore.getState().nodes.length).toBeGreaterThan(0);
});

test('ghost workflow hides after a ghost node is clicked and a real node exists', () => {
  render(<GhostWorkflow />);
  const ghostNodes = screen.getAllByTestId(/^ghost-node-/);
  act(() => { fireEvent.click(ghostNodes[0]); });
  // The ghost itself hides when nodes.length > 0
  expect(screen.queryByTestId('ghost-workflow')).not.toBeInTheDocument();
});
