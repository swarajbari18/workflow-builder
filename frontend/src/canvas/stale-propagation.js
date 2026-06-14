/**
 * Stale propagation — pure logic for computing which nodes become stale
 * when a node's configuration changes.
 *
 * A node is stale when it or any of its upstream ancestors has changed
 * config since the last run. Staleness flows DOWNSTREAM: if node B feeds
 * node C, and B's config changes, C's output is now uncertain too.
 */

/**
 * Returns the IDs of all nodes that are stale given one changed node.
 * Includes the changed node itself and every node reachable downstream.
 *
 * @param {string} changedNodeId
 * @param {{id: string}[]} nodes
 * @param {{source: string, target: string}[]} edges
 * @returns {Set<string>}
 */
export function getStaleNodeIds(changedNodeId, nodes, edges) {
  const stale = new Set();
  const queue = [changedNodeId];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (stale.has(nodeId)) continue;
    stale.add(nodeId);

    for (const edge of edges) {
      if (edge.source === nodeId) {
        queue.push(edge.target);
      }
    }
  }

  return stale;
}
