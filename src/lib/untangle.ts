// Edge-crossing reduction for the network graph.
//
// A force simulation optimizes distances, never crossings — which is why a
// settled layout still reads as spaghetti, and why dragging one node by hand
// can visibly clean the whole picture up. This runs after the simulation
// cools, in two alternating phases:
//
//   swap      — trade two nodes' positions when that removes crossings. Keeps
//               the exact set of positions the forces produced, so spacing and
//               centering survive untouched.
//   relocate  — move one node somewhere new, near the barycenter of its own
//               neighbors. Some tangles have no fix in the existing set of
//               positions: a node wired to three others but parked outside all
//               of them drags its edges across the picture, and only pulling it
//               in between them helps. Candidate positions are rejected unless
//               they keep every node's collision spacing and stay in frame.
//
// Both phases only ever accept a strict improvement, so the result can't read
// worse than what the forces handed over.

export type LayoutNode = {
  id: string;
  x?: number;
  y?: number;
  fixed?: boolean;
  // Collision radius (node + its labels). Two nodes are kept at least the sum
  // of their radii apart, matching what forceCollide enforces.
  radius?: number;
};
export type LayoutEdge = { source: string; target: string };

// Above this many nodes the layout is unreadable no matter how it's arranged,
// so don't spend anything on it.
const MAX_NODES = 250;
const MAX_ROUNDS = 8;
// The sweep is O(n²·E) per pass, which is milliseconds at ~20 nodes and
// seconds at ~100. It improves monotonically and can be stopped at any point,
// so it runs against a frame-friendly budget instead of a size cutoff: small
// graphs converge well inside it, big ones keep whatever they earned.
const TIME_BUDGET_MS = 120;
// Equal-crossings moves are taken only when they also pull edge length in by
// this much — enough to compact stragglers without churning the layout.
const LENGTH_GAIN = 0.95;
// Spacing is enforced at slightly under the full collision radius, since
// forceCollide itself runs at strength 0.9 and settles a little tight.
const PACKING = 0.9;
// Candidate offsets around a node's barycenter, as (angle count, radius) —
// the barycenter itself is often occupied or too tight, so the ring gives the
// search somewhere else to land.
const CANDIDATE_ANGLES = 12;
const CANDIDATE_RADII = [0, 60, 120];
const DEFAULT_RADIUS = 50;
// How many times a candidate may be pushed off whatever it overlaps before the
// search gives up on it.
const NUDGE_ITERATIONS = 16;
// Local search stops at the first arrangement it can't improve one move at a
// time, which is usually a few crossings short of what the graph allows. Each
// extra iteration kicks the worst node out of place and re-searches, keeping
// the best arrangement seen — the standard escape from a local optimum.
const MAX_ITERATIONS = 24;
// Some crossings are structural — no arrangement of the nodes removes them —
// so stop once this many kicks in a row fail to beat the best seen instead of
// spending the whole budget proving it.
const STALL_LIMIT = 4;

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
  radii: Float64Array;
  edges: [number, number][];
  incident: number[][];
  neighbors: number[][];
  fixed: boolean[];
};

function prepare(nodes: LayoutNode[], edges: LayoutEdge[]): Prepared | null {
  const index = new Map<string, number>();
  nodes.forEach((n, i) => index.set(n.id, i));
  const xs = new Float64Array(nodes.length);
  const ys = new Float64Array(nodes.length);
  const radii = new Float64Array(nodes.length);
  const fixed: boolean[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
    xs[i] = n.x as number;
    ys[i] = n.y as number;
    radii[i] = n.radius ?? DEFAULT_RADIUS;
    fixed.push(!!n.fixed);
  }
  const pairs: [number, number][] = [];
  const incident: number[][] = nodes.map(() => []);
  const neighbors: number[][] = nodes.map(() => []);
  for (const e of edges) {
    const a = index.get(e.source);
    const b = index.get(e.target);
    if (a === undefined || b === undefined || a === b) continue;
    const idx = pairs.length;
    pairs.push([a, b]);
    incident[a].push(idx);
    incident[b].push(idx);
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  return { xs, ys, radii, edges: pairs, incident, neighbors, fixed };
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

// Would putting node i at (x, y) crowd anyone? Mirrors forceCollide: the gap
// between two node centers must cover both collision radii.
function fits(p: Prepared, i: number, x: number, y: number, bounds?: Bounds): boolean {
  if (bounds) {
    const r = p.radii[i] * 0.5;
    if (x < bounds.minX + r || x > bounds.maxX - r) return false;
    if (y < bounds.minY + r || y > bounds.maxY - r) return false;
  }
  for (let j = 0; j < p.xs.length; j++) {
    if (j === i) continue;
    const min = (p.radii[i] + p.radii[j]) * PACKING;
    const dx = x - p.xs[j];
    const dy = y - p.ys[j];
    if (dx * dx + dy * dy < min * min) return false;
  }
  return true;
}

// Slide a candidate point off whatever it overlaps, worst offender first, so
// the search lands on the closest feasible spot to where it aimed. A settled
// layout is packed to the collision radius, so almost every interesting
// candidate starts out overlapping someone — without this the relocate phase
// finds nothing to do.
function nudgeToFit(
  p: Prepared,
  i: number,
  x: number,
  y: number,
  bounds?: Bounds
): { x: number; y: number } | null {
  let cx = x;
  let cy = y;
  for (let iter = 0; iter < NUDGE_ITERATIONS; iter++) {
    let worst = -1;
    let worstOverlap = 0;
    for (let j = 0; j < p.xs.length; j++) {
      if (j === i) continue;
      const min = (p.radii[i] + p.radii[j]) * PACKING;
      const d = Math.hypot(cx - p.xs[j], cy - p.ys[j]);
      const overlap = min - d;
      if (overlap > worstOverlap) {
        worstOverlap = overlap;
        worst = j;
      }
    }
    if (worst < 0) return fits(p, i, cx, cy, bounds) ? { x: cx, y: cy } : null;
    const min = (p.radii[i] + p.radii[worst]) * PACKING;
    let dx = cx - p.xs[worst];
    let dy = cy - p.ys[worst];
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      // Exactly on top of it — pick a deterministic direction to escape.
      dx = Math.cos(i);
      dy = Math.sin(i);
    } else {
      dx /= d;
      dy /= d;
    }
    cx = p.xs[worst] + dx * min;
    cy = p.ys[worst] + dy * min;
  }
  return fits(p, i, cx, cy, bounds) ? { x: cx, y: cy } : null;
}

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

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

// Hill-climb over swaps and relocations. Nodes marked `fixed` (the You anchor)
// never move. Returns the target positions rather than mutating, so the caller
// can animate into them.
export function untangle(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  bounds?: Bounds
): UntangleResult {
  const empty = { positions: new Map<string, { x: number; y: number }>(), before: 0, after: 0 };
  if (nodes.length < 4 || nodes.length > MAX_NODES) return empty;
  const p = prepare(nodes, edges);
  if (!p || p.edges.length < 2) return empty;

  const all = new Set<number>();
  for (let i = 0; i < p.edges.length; i++) all.add(i);
  const before = crossingsTouching(p, all);
  if (before === 0) return { ...empty, before, after: before };

  const { xs, ys, incident, neighbors, fixed } = p;
  const swap = (i: number, j: number) => {
    const tx = xs[i], ty = ys[i];
    xs[i] = xs[j]; ys[i] = ys[j];
    xs[j] = tx; ys[j] = ty;
  };

  const deadline = performance.now() + TIME_BUDGET_MS;
  const outOfTime = () => performance.now() > deadline;

  // Phase 1 — trade positions between two nodes.
  const swapPass = (): boolean => {
    let improved = false;
    for (let i = 0; i < nodes.length; i++) {
      if (outOfTime()) return improved;
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
    return improved;
  };

  // The search behind phase 2: ring of candidate spots around the barycenter of
  // node i's neighbors — where a node wired to three others belongs, and the
  // move a person makes by hand when they drag one node into the middle of the
  // ones it links to. `mustImprove` false makes it a kick: it takes the least
  // bad spot elsewhere even when that costs a crossing.
  const bestSpot = (i: number, mustImprove: boolean): { x: number; y: number } | null => {
    if (neighbors[i].length === 0) return null;
    const affected = new Set<number>(incident[i]);
    const homeX = xs[i];
    const homeY = ys[i];
    let bx = 0;
    let by = 0;
    for (const nb of neighbors[i]) {
      bx += xs[nb];
      by += ys[nb];
    }
    bx /= neighbors[i].length;
    by /= neighbors[i].length;

    let bestX = mustImprove ? homeX : Number.NaN;
    let bestY = mustImprove ? homeY : Number.NaN;
    let bestCrossings = mustImprove ? crossingsTouching(p, affected) : Infinity;
    let bestLength = mustImprove ? incidentLength(p, affected) : Infinity;

    for (const radius of CANDIDATE_RADII) {
      const steps = radius === 0 ? 1 : CANDIDATE_ANGLES;
      for (let a = 0; a < steps; a++) {
        const angle = (a / steps) * Math.PI * 2;
        const spot = nudgeToFit(
          p,
          i,
          bx + Math.cos(angle) * radius,
          by + Math.sin(angle) * radius,
          bounds
        );
        if (!spot) continue;
        xs[i] = spot.x;
        ys[i] = spot.y;
        const nowCrossings = crossingsTouching(p, affected);
        const nowLength = incidentLength(p, affected);
        if (
          nowCrossings < bestCrossings ||
          (nowCrossings === bestCrossings && nowLength < bestLength * LENGTH_GAIN)
        ) {
          bestCrossings = nowCrossings;
          bestLength = nowLength;
          bestX = spot.x;
          bestY = spot.y;
        }
      }
    }
    xs[i] = homeX;
    ys[i] = homeY;
    if (!Number.isFinite(bestX)) return null;
    if (bestX === homeX && bestY === homeY) return null;
    return { x: bestX, y: bestY };
  };

  // Phase 2 — move one node somewhere new. Only nodes whose own edges are
  // crossed are worth the search.
  const relocatePass = (): boolean => {
    let improved = false;
    for (let i = 0; i < nodes.length; i++) {
      if (outOfTime()) return improved;
      if (fixed[i] || incident[i].length === 0) continue;
      if (crossingsTouching(p, new Set(incident[i])) === 0) continue;
      const spot = bestSpot(i, true);
      if (!spot) continue;
      xs[i] = spot.x;
      ys[i] = spot.y;
      improved = true;
    }
    return improved;
  };

  const localSearch = () => {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const swapped = swapPass();
      const slid = relocatePass();
      if ((!swapped && !slid) || outOfTime()) break;
    }
  };

  // Displace the node carrying the most crossings, even at a cost, so the next
  // local search starts somewhere else. Which node gets kicked rotates with the
  // iteration, keeping the whole thing deterministic.
  const kick = (iteration: number) => {
    const ranked = [];
    for (let i = 0; i < nodes.length; i++) {
      if (fixed[i] || incident[i].length === 0) continue;
      const count = crossingsTouching(p, new Set(incident[i]));
      if (count > 0) ranked.push({ i, count });
    }
    if (ranked.length === 0) return false;
    ranked.sort((a, b) => b.count - a.count || a.i - b.i);
    for (let k = 0; k < ranked.length; k++) {
      const pick = ranked[(iteration + k) % ranked.length].i;
      const spot = bestSpot(pick, false);
      if (!spot) continue;
      xs[pick] = spot.x;
      ys[pick] = spot.y;
      return true;
    }
    // Nowhere feasible to put anyone — fall back to parking the worst node in
    // the slot closest to where its neighbors sit, and whoever held that slot
    // takes its place.
    const worst = ranked[0].i;
    let bx = 0;
    let by = 0;
    for (const nb of neighbors[worst]) {
      bx += xs[nb];
      by += ys[nb];
    }
    bx /= neighbors[worst].length || 1;
    by /= neighbors[worst].length || 1;
    let closest = -1;
    let closestDist = Infinity;
    for (let j = 0; j < nodes.length; j++) {
      if (j === worst || fixed[j] || incident[j].length === 0) continue;
      const d = Math.hypot(xs[j] - bx, ys[j] - by);
      if (d < closestDist) {
        closestDist = d;
        closest = j;
      }
    }
    if (closest < 0) return false;
    swap(worst, closest);
    return true;
  };

  let bestXs = xs.slice();
  let bestYs = ys.slice();
  let bestCount = before;
  let stalled = 0;
  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    localSearch();
    const count = crossingsTouching(p, all);
    if (count < bestCount) {
      bestCount = count;
      bestXs = xs.slice();
      bestYs = ys.slice();
      stalled = 0;
    } else {
      stalled++;
    }
    if (bestCount === 0 || stalled >= STALL_LIMIT || outOfTime()) break;
    if (!kick(iteration)) break;
  }
  xs.set(bestXs);
  ys.set(bestYs);

  const positions = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < nodes.length; i++) {
    if (xs[i] !== nodes[i].x || ys[i] !== nodes[i].y) {
      positions.set(nodes[i].id, { x: xs[i], y: ys[i] });
    }
  }
  return { positions, before, after: crossingsTouching(p, all) };
}
