import type { Relationship } from '../model/types';
import { computePorts, portPoint, type Port, type Rect } from './ports';
import { elbow, nudgeOverlaps, routeAround, segmentsOf, type Pt, type Seg } from './routing';

type Ports = Map<string, { source: Port; target: Port }>;

export interface Layout {
  ports: Ports;
  routes: Map<string, Pt[]>;
}

function routeAll(rects: Map<string, Rect>, relationships: Relationship[], ports: Ports): Map<string, Pt[]> {
  // Every line is routed with right angles around the entities and away from other lines.
  const routes = new Map<string, Pt[]>();
  const occupied: Seg[] = [];
  for (const r of relationships) {
    if (r.source.entityId === r.target.entityId) continue;
    const sr = rects.get(r.source.entityId);
    const tr = rects.get(r.target.entityId);
    const pr = ports.get(r.id);
    if (!sr || !tr || !pr) continue;
    const A = portPoint(sr, pr.source);
    const B = portPoint(tr, pr.target);
    const route = routeAround(A.p, A.u, B.p, B.u, [...rects.values()], occupied) ?? elbow(A.p, A.u, B.p, B.u);
    routes.set(r.id, route);
    occupied.push(...segmentsOf(route));
  }
  nudgeOverlaps([...routes.values()]);
  return routes;
}

function crossingsBetween(a: Seg[], b: Seg[]): number {
  let n = 0;
  for (const s of a) {
    for (const t of b) {
      if (s.horizontal === t.horizontal) continue;
      const [h, v] = s.horizontal ? [s, t] : [t, s];
      if (v.at > h.from + 0.5 && v.at < h.to - 0.5 && h.at > v.from + 0.5 && h.at < v.to - 0.5) n++;
    }
  }
  return n;
}

/** Number of points where two different lines cross. */
export function countCrossings(routes: Iterable<Pt[]>): number {
  const all = [...routes].map(segmentsOf);
  let n = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) n += crossingsBetween(all[i], all[j]);
  return n;
}

/** Crossings that involve at least one of the given lines. */
function crossingsOf(ids: Set<string>, segs: Map<string, Seg[]>): number {
  let n = 0;
  for (const id of ids) {
    for (const [other, s] of segs) {
      if (other === id || (ids.has(other) && other < id)) continue;
      n += crossingsBetween(segs.get(id)!, s);
    }
  }
  return n;
}

/** Which way a route turns after leaving a port, and how far out: lines are ordered on a side by this. */
function exitKey(pts: Pt[], side: Port['side']): number {
  if (pts.length <= 2) return 0; // straight across
  const alongX = side === 'top' || side === 'bottom';
  const turn = alongX ? pts[2].x - pts[1].x : pts[2].y - pts[1].y;
  const dist = alongX ? Math.abs(pts[1].y - pts[0].y) : Math.abs(pts[1].x - pts[0].x);
  // Turning toward the low end (up / left): at that end, earliest turn outermost. Likewise for the high end.
  if (turn < -0.5) return -1e6 + dist;
  if (turn > 0.5) return 1e6 - dist;
  return 0;
}

/** Move the end of a route to a new port point on the same side, keeping right angles. */
function moveEnd(route: Pt[], atStart: boolean, p: Pt, alongX: boolean): Pt[] {
  const pts = atStart ? route.map((q) => ({ ...q })) : route.map((q) => ({ ...q })).reverse();
  if (pts.length === 2) {
    // Straight line: add a jog halfway.
    const [a, b] = pts;
    const mid = alongX ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
    const jog = alongX ? [{ x: p.x, y: mid }, { x: b.x, y: mid }] : [{ x: mid, y: p.y }, { x: mid, y: b.y }];
    pts.splice(0, 2, p, ...jog, b);
  } else {
    if (alongX) pts[1].x = p.x;
    else pts[1].y = p.y;
    pts[0] = p;
  }
  return atStart ? pts : pts.reverse();
}

/**
 * Lines sharing an entity side are first ordered by where the entity at the other end is.
 * Once routed, re-order them by where their routes actually go, so neighbouring lines don't
 * cross just outside the entity. Each side's new order is kept only if it doesn't add crossings.
 */
function untangleEnds(rects: Map<string, Rect>, relationships: Relationship[], layout: Layout): Layout {
  const ports: Ports = new Map([...layout.ports].map(([id, p]) => [id, { ...p }]));
  const routes = new Map(layout.routes);
  type End = { relId: string; end: 'source' | 'target'; entityId: string };
  const groups = new Map<string, End[]>();
  for (const r of relationships) {
    const pr = ports.get(r.id);
    if (!pr || !routes.has(r.id)) continue;
    for (const end of ['source', 'target'] as const) {
      const entityId = r[end].entityId;
      const k = `${entityId}|${pr[end].side}`;
      const g = groups.get(k);
      if (g) g.push({ relId: r.id, end, entityId });
      else groups.set(k, [{ relId: r.id, end, entityId }]);
    }
  }
  const segs = new Map([...routes].map(([id, r]) => [id, segmentsOf(r)]));
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const side = ports.get(g[0].relId)![g[0].end].side;
    const alongX = side === 'top' || side === 'bottom';
    const keyOf = (e: End) => {
      const route = routes.get(e.relId)!;
      return exitKey(e.end === 'source' ? route : [...route].reverse(), side);
    };
    const fOf = (e: End) => ports.get(e.relId)![e.end].f;
    const current = [...g].sort((a, b) => fOf(a) - fOf(b));
    const wanted = [...g].sort((a, b) => keyOf(a) - keyOf(b) || fOf(a) - fOf(b));
    if (wanted.every((e, i) => e === current[i])) continue;
    const fs = current.map(fOf);
    const trial = new Map<string, Pt[]>();
    const trialPorts = new Map<string, { source: Port; target: Port }>();
    wanted.forEach((e, i) => {
      const port = { side, f: fs[i] };
      const p = portPoint(rects.get(e.entityId)!, port).p;
      trial.set(e.relId, moveEnd(trial.get(e.relId) ?? routes.get(e.relId)!, e.end === 'source', p, alongX));
      const pr = trialPorts.get(e.relId) ?? { ...ports.get(e.relId)! };
      pr[e.end] = port;
      trialPorts.set(e.relId, pr);
    });
    const ids = new Set(trial.keys());
    const before = crossingsOf(ids, segs);
    const trialSegs = new Map(segs);
    for (const [id, r] of trial) trialSegs.set(id, segmentsOf(r));
    if (crossingsOf(ids, trialSegs) <= before) {
      for (const [id, r] of trial) {
        routes.set(id, r);
        segs.set(id, trialSegs.get(id)!);
      }
      for (const [id, pr] of trialPorts) ports.set(id, { ...ports.get(id)!, ...pr });
    }
  }
  return { ports, routes };
}

/** Attachment ports and right-angle routes for every relationship line (self-references excluded). */
export function layoutDiagram(rects: Map<string, Rect>, relationships: Relationship[]): Layout {
  const ports = computePorts(rects, relationships);
  return untangleEnds(rects, relationships, { ports, routes: routeAll(rects, relationships, ports) });
}
