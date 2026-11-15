import type { Rect } from './ports';

export interface Pt {
  x: number;
  y: number;
}

/* --------------------------------------------------------- orthogonal router */

const MARGIN = 48; // clearance kept around entities: the crow's foot symbols reach ~31px, plus room to spare
export const STUB = 52; // straight run out of each port, past the crow's foot symbols and the clearance
const BEND_PENALTY = 60;

class MinHeap {
  private a: { k: number; v: number }[] = [];
  get size() {
    return this.a.length;
  }
  push(k: number, v: number) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].k <= a[i].k) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0].v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].k < a[m].k) m = l;
        if (r < a.length && a[r].k < a[m].k) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: Pt[] = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
  { x: 0, y: -1 },
];
const dirIndex = (u: Pt) => DIRS.findIndex((d) => d.x === Math.sign(u.x) && d.y === Math.sign(u.y));

/**
 * Orthogonal route from port p1 (leaving along u1) to port p2 (arriving against u2) that keeps
 * clear of the obstacle rectangles. Returns the corner points including both ports, or null.
 */
export interface Seg {
  horizontal: boolean;
  at: number; // y for horizontal, x for vertical
  from: number;
  to: number;
}

export function segmentsOf(pts: Pt[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    if (Math.abs(a.y - b.y) < 0.5) out.push({ horizontal: true, at: a.y, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) });
    else if (Math.abs(a.x - b.x) < 0.5) out.push({ horizontal: false, at: a.x, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) });
  }
  return out;
}

const OVERLAP_PENALTY = 80;
/** Cost of crossing another line: worth a detour of about this many px. */
const CROSS_PENALTY = 90;

export function routeAround(p1: Pt, u1: Pt, p2: Pt, u2: Pt, obstacles: Rect[], occupied: Seg[] = []): Pt[] | null {
  const inRaw = (q: Pt, r: Rect) => q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h;
  // Shorten a stub that would run into a neighbouring entity.
  const stubFor = (p: Pt, u: Pt) => {
    let len = STUB;
    while (len > 8 && obstacles.some((r) => inRaw({ x: p.x + u.x * len, y: p.y + u.y * len }, r))) len -= 4;
    return len;
  };
  let l1 = stubFor(p1, u1);
  let l2 = stubFor(p2, u2);
  // Sides facing each other across a gap narrower than two stubs: meet halfway with a short jog,
  // instead of overshooting and having to loop back round one of the entities.
  if (u1.x === -u2.x && u1.y === -u2.y) {
    const gapBetween = (p2.x - p1.x) * u1.x + (p2.y - p1.y) * u1.y;
    if (gapBetween > 0 && gapBetween < l1 + l2) l1 = l2 = gapBetween / 2;
  }
  const s = { x: p1.x + u1.x * l1, y: p1.y + u1.y * l1 };
  const e = { x: p2.x + u2.x * l2, y: p2.y + u2.y * l2 };
  // Outside distance from a point to a rectangle (negative when inside).
  const gap = (q: Pt, r: Rect) => Math.max(r.x - q.x, q.x - (r.x + r.w), r.y - q.y, q.y - (r.y + r.h));
  const inflated: Rect[] = [];
  for (const r of obstacles) {
    if (inRaw(s, r) || inRaw(e, r)) continue; // overlapping entities: can't keep clear of this one
    // Shrink the clearance where entities are close together so start/end stay outside it.
    const m = Math.max(0, Math.min(MARGIN, gap(s, r) - 1, gap(e, r) - 1));
    inflated.push({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });
  }
  const inside = (x: number, y: number) => inflated.some((r) => x > r.x + 0.5 && x < r.x + r.w - 0.5 && y > r.y + 0.5 && y < r.y + r.h - 0.5);
  if (inside(s.x, s.y) || inside(e.x, e.y)) return null;

  const uniq = (v: number[]) => [...new Set(v.map((n) => Math.round(n * 2) / 2))].sort((a, b) => a - b);
  const xs = uniq([s.x, e.x, ...inflated.flatMap((r) => [r.x, r.x + r.w])]);
  const ys = uniq([s.y, e.y, ...inflated.flatMap((r) => [r.y, r.y + r.h])]);
  // Extra lanes halfway between neighbouring coordinates give routes through gaps between entities.
  const withMid = (v: number[]) => uniq([...v, ...v.slice(1).map((n, i) => (n + v[i]) / 2)]);
  const X = withMid(xs);
  const Y = withMid(ys);
  const W = X.length;
  const H = Y.length;
  const idx = (ix: number, iy: number) => iy * W + ix;
  const sx = X.indexOf(Math.round(s.x * 2) / 2);
  const sy = Y.indexOf(Math.round(s.y * 2) / 2);
  const ex = X.indexOf(Math.round(e.x * 2) / 2);
  const ey = Y.indexOf(Math.round(e.y * 2) / 2);
  if (sx < 0 || sy < 0 || ex < 0 || ey < 0) return null;

  // Penalties for other lines, worked out once per grid edge. hEdge[iy*W+ix]: step from X[ix] to X[ix+1]
  // along row iy; vEdge[ix*H+iy]: step from Y[iy] to Y[iy+1] along column ix.
  const hOverlap = new Uint8Array(W * H);
  const vOverlap = new Uint8Array(W * H);
  const hCross = new Uint16Array(W * H);
  const vCross = new Uint16Array(W * H);
  const lowerIndex = (arr: number[], v: number) => {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  for (const o of occupied) {
    // Rows/columns (along) are the lanes parallel to o; cross are perpendicular to it.
    const [along, cross, overlap, crossings, stride] = o.horizontal ? [Y, X, hOverlap, vCross, H] : [X, Y, vOverlap, hCross, W];
    const nCross = cross.length;
    // Running along a lane another line already uses.
    for (let a = lowerIndex(along, o.at - 6 + 1e-9); a < along.length && along[a] < o.at + 6; a++) {
      for (let c = Math.max(0, lowerIndex(cross, o.from + 0.5) - 1); c < nCross - 1 && cross[c] < o.to - 0.5; c++) {
        if (cross[c + 1] > o.from + 0.5) overlap[o.horizontal ? a * W + c : a * H + c] = 1;
      }
    }
    // Crossing it: perpendicular steps whose lane lies strictly inside o and that reach o.at.
    const lanes = cross; // perpendicular lanes run along `cross` coordinates
    const steps = along;
    const k = lowerIndex(steps, o.at - 0.5) - 1; // step from steps[k] to steps[k+1] reaches o.at
    if (k < 0 || k >= steps.length - 1) continue;
    for (let c = lowerIndex(lanes, o.from + 0.5 + 1e-9); c < lanes.length && lanes[c] < o.to - 0.5; c++) {
      crossings[o.horizontal ? c * stride + k : c * W + k] += 1;
    }
  }

  // Grid points and edge midpoints inside an (inflated) entity can't be used; worked out when first needed.
  const cellBlocked = new Int8Array(W * H).fill(-1);
  const hMidBlocked = new Int8Array(W * H).fill(-1);
  const vMidBlocked = new Int8Array(W * H).fill(-1);

  const startDir = dirIndex(u1);
  const endDir = dirIndex({ x: -u2.x, y: -u2.y }); // direction of travel arriving at e
  const n = W * H * 4;
  const cost = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  const startState = idx(sx, sy) * 4 + startDir;
  cost[startState] = 0;
  heap.push(0, startState);
  const goalCell = idx(ex, ey);
  let goal = -1;

  while (heap.size) {
    const st = heap.pop();
    const cell = st >> 2;
    const d = st & 3;
    if (cell === goalCell) {
      goal = st;
      break;
    }
    const ix = cell % W;
    const iy = (cell / W) | 0;
    for (let nd = 0; nd < 4; nd++) {
      if (nd === ((d + 2) & 3)) continue; // no U-turns
      const jx = ix + DIRS[nd].x;
      const jy = iy + DIRS[nd].y;
      if (jx < 0 || jy < 0 || jx >= W || jy >= H) continue;
      const cj = idx(jx, jy);
      if (cellBlocked[cj] < 0) cellBlocked[cj] = inside(X[jx], Y[jy]) ? 1 : 0;
      if (cellBlocked[cj]) continue;
      const horizontalStep = nd === 0 || nd === 2;
      const mid = horizontalStep ? iy * W + Math.min(ix, jx) : ix * H + Math.min(iy, jy);
      const midBlocked = horizontalStep ? hMidBlocked : vMidBlocked;
      if (midBlocked[mid] < 0) midBlocked[mid] = inside((X[ix] + X[jx]) / 2, (Y[iy] + Y[jy]) / 2) ? 1 : 0;
      if (midBlocked[mid]) continue;
      const len = Math.abs(X[jx] - X[ix]) + Math.abs(Y[jy] - Y[iy]);
      let c = cost[st] + len + (nd === d ? 0 : BEND_PENALTY);
      if (occupied.length) {
        // Discourage running along a lane another line already uses, and crossing other lines.
        if (nd === 0 || nd === 2) {
          const e = iy * W + Math.min(ix, jx);
          if (hOverlap[e]) c += OVERLAP_PENALTY + len;
          c += hCross[e] * CROSS_PENALTY;
        } else {
          const e = ix * H + Math.min(iy, jy);
          if (vOverlap[e]) c += OVERLAP_PENALTY + len;
          c += vCross[e] * CROSS_PENALTY;
        }
      }
      if (jx === ex && jy === ey && nd !== endDir) c += BEND_PENALTY; // must turn once more to enter the port
      const ns = idx(jx, jy) * 4 + nd;
      if (c < cost[ns]) {
        cost[ns] = c;
        from[ns] = st;
        heap.push(c + Math.abs(X[jx] - X[ex]) + Math.abs(Y[jy] - Y[ey]), ns);
      }
    }
  }
  if (goal < 0) return null;

  const cells: Pt[] = [];
  for (let st = goal; st >= 0; st = from[st]) {
    const cell = st >> 2;
    cells.push({ x: X[cell % W], y: Y[(cell / W) | 0] });
  }
  cells.reverse();
  return simplify([p1, ...cells, p2]);
}

/** Drop repeated and collinear points. */
export function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      const collinear = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5) || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
      if (!collinear) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** SVG path through the points; rounded corners when radius > 0. */
export function polylinePath(pts: Pt[], radius: number): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    const la = Math.hypot(b.x - a.x, b.y - a.y);
    const lc = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(radius, la / 2, lc / 2);
    if (r < 1) {
      d += ` L${b.x},${b.y}`;
      continue;
    }
    const p = { x: b.x + ((a.x - b.x) / la) * r, y: b.y + ((a.y - b.y) / la) * r };
    const q = { x: b.x + ((c.x - b.x) / lc) * r, y: b.y + ((c.y - b.y) / lc) * r };
    d += ` L${p.x},${p.y} Q${b.x},${b.y} ${q.x},${q.y}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last.x},${last.y}`;
}

/** Point halfway along the polyline (for the label). */
export function polylineMidpoint(pts: Pt[]): Pt {
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y));
  let half = lens.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < lens.length; i++) {
    if (half <= lens[i]) {
      const t = lens[i] ? half / lens[i] : 0;
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t };
    }
    half -= lens[i];
  }
  return pts[pts.length - 1];
}

const NUDGE = 9;

/**
 * Shift interior segments of different routes that lie on top of each other
 * so parallel lines run side by side. Routes are modified in place.
 */
export function nudgeOverlaps(routes: Pt[][]) {
  type Item = { route: number; i: number; horizontal: boolean; at: number; from: number; to: number };
  const items: Item[] = [];
  routes.forEach((pts, r) => {
    // Skip the first and last segment: they leave the ports and carry the symbols.
    for (let i = 2; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      if (!horizontal && Math.abs(a.x - b.x) >= 0.5) continue;
      items.push({
        route: r,
        i,
        horizontal,
        at: horizontal ? a.y : a.x,
        from: horizontal ? Math.min(a.x, b.x) : Math.min(a.y, b.y),
        to: horizontal ? Math.max(a.x, b.x) : Math.max(a.y, b.y),
      });
    }
  });
  const used = new Set<Item>();
  for (const it of items) {
    if (used.has(it)) continue;
    const group = items.filter(
      (o) => !used.has(o) && o.horizontal === it.horizontal && Math.abs(o.at - it.at) < 4 && o.from < it.to - 0.5 && o.to > it.from + 0.5,
    );
    const routesInGroup = new Set(group.map((g) => g.route));
    if (routesInGroup.size < 2) continue;
    // One shift per route, ordered by where the segment starts so lines don't cross.
    group.sort((a, b) => a.from - b.from || a.route - b.route);
    const order = [...new Map(group.map((g) => [g.route, g])).values()];
    order.forEach((g, k) => {
      const shift = (k - (order.length - 1) / 2) * NUDGE;
      used.add(g);
      const pts = routes[g.route];
      const a = pts[g.i - 1];
      const b = pts[g.i];
      if (g.horizontal) {
        a.y += shift;
        b.y += shift;
      } else {
        a.x += shift;
        b.x += shift;
      }
    });
    for (const g of group) used.add(g);
  }
}

/** Simple right-angle connection used when the router finds no clear path (e.g. overlapping entities). */
export function elbow(p1: Pt, u1: Pt, p2: Pt, u2: Pt): Pt[] {
  const s = { x: p1.x + u1.x * STUB, y: p1.y + u1.y * STUB };
  const e = { x: p2.x + u2.x * STUB, y: p2.y + u2.y * STUB };
  const mid = u1.x !== 0 ? [{ x: (s.x + e.x) / 2, y: s.y }, { x: (s.x + e.x) / 2, y: e.y }] : [{ x: s.x, y: (s.y + e.y) / 2 }, { x: e.x, y: (s.y + e.y) / 2 }];
  return simplify([p1, s, ...mid, e, p2]);
}
