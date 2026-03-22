import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NavNode {
  id: number;
  position: THREE.Vector3;
}

export interface NavEdge {
  from: number; // NavNode id
  to: number;   // NavNode id
  cost: number; // Euclidean distance
}

export interface NavGraph {
  nodes: NavNode[];
  edges: NavEdge[];
  /** Adjacency list: nodeId → list of { to, cost } */
  adjacency: Map<number, { to: number; cost: number }[]>;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

const SNAP_EPSILON = 0.001; // vertices closer than this are merged into one node

/**
 * Traverse a loaded GLTF scene, find all meshes whose name starts with
 * 'navpath' (or are children of a node named 'paths'), and build a NavGraph
 * from their LINES primitives.
 *
 * Usage:
 *   const gltf = await loader.loadAsync('map.glb');
 *   const graph = extractNavGraph(gltf);
 */
export function extractNavGraph(gltf: GLTF, nameFilter = /^navpath|^paths/i): NavGraph {
  const positionKey = (v: THREE.Vector3) =>
    `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;

  const keyToId = new Map<string, number>();
  const nodes: NavNode[] = [];
  const edges: NavEdge[] = [];

  function getOrCreateNode(worldPos: THREE.Vector3): number {
    const key = positionKey(worldPos);
    if (keyToId.has(key)) return keyToId.get(key)!;
    const id = nodes.length;
    nodes.push({ id, position: worldPos.clone() });
    keyToId.set(key, id);
    return id;
  }

  // Walk every node in the GLTF scene
  gltf.scene.traverse((obj) => {
    // Match by object name OR parent name ('paths' collection in Blender)
    const matchesSelf = nameFilter.test(obj.name);
    const matchesParent = obj.parent ? nameFilter.test(obj.parent.name) : false;
    if (!matchesSelf && !matchesParent) return;
    if (!(obj instanceof THREE.Mesh)) return;

    const mesh = obj as THREE.Mesh;
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    if (!posAttr) return;

    // Compute world matrix so positions are in world space
    mesh.updateWorldMatrix(true, false);
    const mat = mesh.matrixWorld;

    const getWorldVert = (i: number): THREE.Vector3 => {
      const v = new THREE.Vector3(
        posAttr.getX(i),
        posAttr.getY(i),
        posAttr.getZ(i)
      );
      return v.applyMatrix4(mat);
    };

    if (geo.index) {
      // Indexed geometry — pairs of indices form line segments
      const idx = geo.index;
      for (let i = 0; i < idx.count; i += 2) {
        const aId = getOrCreateNode(getWorldVert(idx.getX(i)));
        const bId = getOrCreateNode(getWorldVert(idx.getX(i + 1)));
        if (aId !== bId) {
          const cost = nodes[aId].position.distanceTo(nodes[bId].position);
          edges.push({ from: aId, to: bId, cost });
        }
      }
    } else {
      // Non-indexed — consecutive pairs are line segments (GL_LINES)
      for (let i = 0; i < posAttr.count; i += 2) {
        const aId = getOrCreateNode(getWorldVert(i));
        const bId = getOrCreateNode(getWorldVert(i + 1));
        if (aId !== bId) {
          const cost = nodes[aId].position.distanceTo(nodes[bId].position);
          edges.push({ from: aId, to: bId, cost });
        }
      }
    }
  });

  // Build undirected adjacency list
  const adjacency = new Map<number, { to: number; cost: number }[]>();
  for (const node of nodes) adjacency.set(node.id, []);
  for (const edge of edges) {
    adjacency.get(edge.from)!.push({ to: edge.to,   cost: edge.cost });
    adjacency.get(edge.to)!.push({   to: edge.from, cost: edge.cost });
  }

  console.log(`[NavGraph] Extracted ${nodes.length} nodes, ${edges.length} edges`);
  return { nodes, edges, adjacency };
}

// ---------------------------------------------------------------------------
// Spatial helpers
// ---------------------------------------------------------------------------

/**
 * Find the NavNode closest to a given world position.
 * Use this to snap a player/destination position onto the graph.
 */
export function nearestNode(graph: NavGraph, worldPos: THREE.Vector3): NavNode {
  let best = graph.nodes[0];
  let bestDist = Infinity;
  for (const node of graph.nodes) {
    const d = node.position.distanceToSquared(worldPos);
    if (d < bestDist) { bestDist = d; best = node; }
  }
  return best;
}
