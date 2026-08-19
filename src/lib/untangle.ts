// Edge-crossing reduction for the network graph.
//
// A force simulation optimizes distances, never crossings — which is why a
// settled layout still reads as spaghetti, and why dragging one node by hand
// can visibly clean the whole picture up. This runs after the simulation
// cools: it keeps the positions the forces produced (so spacing, centering and
// collision all survive) and only reassigns which node sits in which position,
// accepting a swap when it removes crossings. Classic layout-preserving
// crossing minimization — cheap, deterministic, and it can't make the layout
// worse than what the forces handed it.

export type LayoutNode = { id: string; x?: number; y?: number; fixed?: boolean };
export type LayoutEdge = { source: string; target: string };

// Above this many nodes the O(n²·E) sweep stops being free; the layout is
// unreadable at that size anyway, so bail rather than jank the frame.
const MAX_NODES = 140;
const MAX_PASSES = 8;
// Equal-crossings swaps are taken only when they also pull edge length in by
// this much — enough to compact stragglers without churning the layout.
const LENGTH_GAIN = 0.95;

function orient(
  ax: number, ay: number,
  bx: number, by: number,
  cx: number, cy: number
): number {
  const v = (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
  if (Math.abs(v) < 1e-9) return 0;
  return v > 0 ? 1 : -1;
}

// Proper crossing only: segments that merely touch at a shared endpoint (every
// pair of edges meeting at a node) are not crossings, and collinear overlap is
// counted as one so a doubled-back edge doesn't score twice.
function segmentsCross(
  p1x: number, p1y: number, p2x: number, p2y: number,
  p3x: number, p3y: number, p4x: number, p4y: number
): boolean {
  const d1 = orient(p3x, p3y, p4x, p4y, p1x, p1y);
  const d2 = orient(p3x, p3y, p4x, p4y, p2x, p2y);
  const d3 = orient(p1x, p1y, p2x, p2y, p3x, p3y);
  const d4 = orient(p1x, p1y, p2x, p2y, p4x, p4y);
  return d1 !== d2 && d3 !== d4;
}

type Prepared = {
  xs: Float64Array;
  ys: Float64Array;
  edges: [number, number][];
  incident: number[][];
  fixed: boolean[];
};

function prepare(nodes: LayoutNode[], edges: LayoutEdge[]): Prepared | null {
  const index = new Map<string, number>();
  nodes.forEach((n, i) => index.set(n.id, i));
  const xs = new Float64Array(nodes.length);
  const ys = new Float64Array(nodes.length);
  const fixed: boolean[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
    xs[i] = n.x as number;
    ys[i] = n.y as number;
    fixed.push(!!n.fixed);
  }
  const pairs: [number, number][] = [];
  const incident: number[][] = nodes.map(() => []);
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const idx = pairs.length;
    pairs.push([a, b]);
    incident[a].push(idx);
    incident[b].push(idx);
  }
  return { xs, ys, edges: pairs, incident, fixed };
}

// Crossings involving any edge in `subset`. Pairs inside the subset are counted
// once (f > e); pairs with one leg outside are always counted.
function crossingsTouching(p: Prepared, subset: Set<number>): number {
  const { xs, ys, edges } = p;
  let count = 0;
  for (const e of subset) {
    const [a, b] = edges[e];
    for (let f = 0; f < edges.length; f++) {
      if (f === e) continue;
      if (subset.has(f) && f < e) continue;
      const [c, d] = edges[f];
      // Shared endpoint — meeting at a node is not a crossing.
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(xs[a], ys[a], xs[b], ys[b], xs[c], ys[c], xs[d], ys[d])) count++;
    }
  }
  return count;
}

function incidentLength(p: Prepared, subset: Set<number>): number {
  const { xs, ys, edges } = p;
  let total = 0;
  for (const e of subset) {
    const [a, b] = edges[e];
    total += Math.hypot(xs[a] - xs[b], ys[a] - ys[b]);
  }
  return total;
}

export function countCrossings(nodes: LayoutNode[], edges: LayoutEdge[]): number {
  const p = prepare(nodes, edges);
  if (!p) return 0;
  const all = new Set<number>();
  for (let i = 0; i < p.edges.length; i++) all.add(i);
  return crossingsTouching(p, all);
}

export type UntangleResult = {
  // Positions to move each node to, keyed by id. Only ids that moved appear.
  positions: Map<string, { x: number; y: number }>;
  before: number;
  after: number;
};

// Hill-climb over position swaps. Nodes marked `fixed` (the You anchor) keep
// their slot. Returns the target positions rather than mutating, so the caller
// can animate into them.
export function untangle(nodes: LayoutNode[], edges: LayoutEdge[]): UntangleResult {
  const empty = { positions: new Map<string, { x: number; y: number }>(), before: 0, after: 0 };
  if (nodes.length < 4 || nodes.length > MAX_NODES) return empty;
  const p = prepare(nodes, edges);
  if (!p || p.edges.length < 2) return empty;

  const all = new Set<number>();
  for (let i = 0; i < p.edges.length; i++) all.add(i);
  const before = crossingsTouching(p, all);
  if (before === 0) return { ...empty, before, after: before };

  const { xs, ys, incident, fixed } = p;
  const swap = (i: number, j: number) => {
    const tx = xs[i], ty = ys[i];
    xs[i] = xs[j]; ys[i] = ys[j];
    xs[j] = tx; ys[j] = ty;
  };

  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let improved = false;
    for (let i = 0; i < nodes.length; i++) {
      if (fixed[i] || incident[i].length === 0) continue;
      for (let j = i + 1; j < nodes.length; j++) {
        if (fixed[j] || incident[j].length === 0) continue;
        const affected = new Set<number>([...incident[i], ...incident[j]]);
        const wasCrossings = crossingsTouching(p, affected);
        const wasLength = incidentLength(p, affected);
        swap(i, j);
        const nowCrossings = crossingsTouching(p, affected);
        const nowLength = incidentLength(p, affected);
        const better =
          nowCrossings < wasCrossings ||
          (nowCrossings === wasCrossings && nowLength < wasLength * LENGTH_GAIN);
        if (better) improved = true;
        else swap(i, j);
      }
    }
    if (!improved) break;
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodes.length; i++) {
    if (xs[i] !== nodes[i].x || ys[i] !== nodes[i].y) {
      positions.set(nodes[i].id, { x: xs[i], y: ys[i] });
    }
  }
  return { positions, before, after: crossingsTouching(p, all) };
}
