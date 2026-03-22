import * as THREE from 'three';
import { type NavGraph, type NavNode, nearestNode } from './navGraph';

// ---------------------------------------------------------------------------
// A* Pathfinding
// ---------------------------------------------------------------------------

interface AStarNode {
  id: number;
  g: number; // cost from start
  f: number; // g + heuristic
  parent: AStarNode | null;
}

/**
 * Run A* from startNode to goalNode on the NavGraph.
 * Returns an ordered array of NavNodes forming the shortest path,
 * or null if no path exists.
 */
export function aStar(
  graph: NavGraph,
  startId: number,
  goalId: number
): NavNode[] | null {
  const heuristic = (id: number) =>
    graph.nodes[id].position.distanceTo(graph.nodes[goalId].position);

  const open = new Map<number, AStarNode>();
  const closed = new Set<number>();

  const startNode: AStarNode = { id: startId, g: 0, f: heuristic(startId), parent: null };
  open.set(startId, startNode);

  while (open.size > 0) {
    // Pick node with lowest f
    let current: AStarNode | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.id === goalId) {
      // Reconstruct path
      const path: NavNode[] = [];
      let n: AStarNode | null = current;
      while (n) { path.unshift(graph.nodes[n.id]); n = n.parent; }
      return path;
    }

    open.delete(current.id);
    closed.add(current.id);

    for (const { to, cost } of graph.adjacency.get(current.id) ?? []) {
      if (closed.has(to)) continue;
      const g = current.g + cost;
      const existing = open.get(to);
      if (!existing || g < existing.g) {
        open.set(to, { id: to, g, f: g + heuristic(to), parent: current });
      }
    }
  }

  return null; // no path found
}

// ---------------------------------------------------------------------------
// Convenience: find path between two world positions
// ---------------------------------------------------------------------------

/**
 * High-level helper: snaps two world positions onto the nav graph,
 * runs A*, and returns the path as an array of world-space Vector3s.
 *
 * Usage:
 *   const path = findPath(graph, playerPosition, destinationPosition);
 *   if (path) drawPathLine(path);
 */
export function findPath(
  graph: NavGraph,
  from: THREE.Vector3,
  to: THREE.Vector3
): THREE.Vector3[] | null {
  if (graph.nodes.length === 0) return null;

  const startNode = nearestNode(graph, from);
  const goalNode  = nearestNode(graph, to);

  if (startNode.id === goalNode.id) return [from.clone(), to.clone()];

  const nodePath = aStar(graph, startNode.id, goalNode.id);
  if (!nodePath) return null;

  // Prepend actual start and append actual goal for sub-node precision
  return [
    from.clone(),
    ...nodePath.map((n) => n.position.clone()),
    to.clone(),
  ];
}

// ---------------------------------------------------------------------------
// Three.js visualisation (optional — call this to draw the path in your scene)
// ---------------------------------------------------------------------------

/**
 * Creates a THREE.Line object from a path array.
 * Add the returned object to your scene; remove/replace it on each new query.
 *
 * Usage:
 *   const line = buildPathLine(path, 0x00ff44);
 *   scene.add(line);
 */
export function buildPathLine(
  path: THREE.Vector3[],
  color = 0x00ff44
): THREE.Line {
  const geo = new THREE.BufferGeometry().setFromPoints(path);
  const mat = new THREE.LineBasicMaterial({ color, linewidth: 2, depthTest: false });
  const line = new THREE.Line(geo, mat);
  line.renderOrder = 999; // draw on top
  return line;
}
