import { getStaleNodeIds } from './stale-propagation';

const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
const linear = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
];
const branched = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'b', target: 'd' },
];
const diamond = [
  { source: 'a', target: 'b' },
  { source: 'a', target: 'c' },
  { source: 'b', target: 'd' },
  { source: 'c', target: 'd' },
];

describe('getStaleNodeIds', () => {
  it('marks the changed node itself as stale', () => {
    const stale = getStaleNodeIds('c', nodes, linear);
    expect(stale.has('c')).toBe(true);
  });

  it('marks all downstream nodes as stale', () => {
    const stale = getStaleNodeIds('a', nodes, branched);
    expect(stale).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('does not mark upstream nodes as stale', () => {
    const stale = getStaleNodeIds('b', nodes, branched);
    expect(stale.has('a')).toBe(false);
    expect(stale.has('b')).toBe(true);
    expect(stale.has('c')).toBe(true);
    expect(stale.has('d')).toBe(true);
  });

  it('handles leaf nodes with no downstream', () => {
    const stale = getStaleNodeIds('c', nodes, linear);
    expect(stale).toEqual(new Set(['c']));
  });

  it('handles disconnected nodes (no edges)', () => {
    const stale = getStaleNodeIds('a', [{ id: 'a' }, { id: 'z' }], []);
    expect(stale).toEqual(new Set(['a']));
  });

  it('handles diamond graphs without duplicates', () => {
    const stale = getStaleNodeIds('a', nodes, diamond);
    expect(stale).toEqual(new Set(['a', 'b', 'c', 'd']));
  });

  it('handles diamond from a mid-node without upstream', () => {
    const stale = getStaleNodeIds('b', nodes, diamond);
    expect(stale.has('a')).toBe(false);
    expect(stale.has('c')).toBe(false);
    expect(stale).toEqual(new Set(['b', 'd']));
  });

  it('returns empty set for a node that does not exist in edges', () => {
    const stale = getStaleNodeIds('z', nodes, linear);
    expect(stale).toEqual(new Set(['z']));
  });
});
