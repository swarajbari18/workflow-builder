import { render } from '@testing-library/react';
import { ConnectionLine } from './connection-line';
import { useStore } from '../store';
import { DATA_TYPE_COLORS } from '../styles/design-tokens';

const renderLine = () =>
  render(
    <svg>
      <ConnectionLine fromX={0} fromY={0} toX={100} toY={50} fromPosition="right" toPosition="left" />
    </svg>,
  );

afterEach(() => useStore.setState({ connectionMode: null }));

describe('ConnectionLine', () => {
  test('draws a curved bezier path (contains a cubic curve command)', () => {
    useStore.setState({ connectionMode: { sourceDataType: 'string' } });
    const { container } = renderLine();
    const path = container.querySelector('path');
    expect(path.getAttribute('d')).toMatch(/C/);
  });

  test('uses the source data-type colour for the stroke', () => {
    useStore.setState({ connectionMode: { sourceDataType: 'string' } });
    const { container } = renderLine();
    expect(container.querySelector('path').getAttribute('stroke')).toBe(DATA_TYPE_COLORS.string);
  });

  test('falls back to a rainbow gradient for the any type', () => {
    useStore.setState({ connectionMode: { sourceDataType: 'any' } });
    const { container } = renderLine();
    const g = container.querySelector('[data-testid="connection-line"]');
    expect(g.dataset.wireColor).toBe('rainbow');
    expect(container.querySelector('linearGradient')).toBeInTheDocument();
  });
});
